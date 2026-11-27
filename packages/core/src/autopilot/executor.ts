import type { ActionItem } from '../actions/actions';
import type { WpChangeType } from '../providers/wordpress';
import { PLUGIN_TYPES } from './run';
import type { WorkItem } from './work-items';

/**
 * Plan executor, part C: tasks are done one by one in plan order (month → week → severity → plan
 * order). A task waits while a task it depends on is not done. Manual tasks never block the queue.
 * A task is done only when every change it needs is verified on the live page (or already right).
 */
export type TaskState = 'queued' | 'preparing' | 'applying' | 'done' | 'needs_you' | 'failed' | 'manual' | 'waiting' | 'later';
export type TaskProgress = { state: TaskState; total: number; verified: number; applied: number; needsYou: number; failed: number; label: string; waitingFor?: string[] };

/** Changes that belong to the whole site rather than one task (sitemap, llms.txt, H1 checks): run first. */
export const SITE_TASK = 'autopilot';

const SEVERITY: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const monthOf = (a: ActionItem) => a.plan?.month ?? Math.max(1, ['d30', 'd60', 'd90', 'd120', 'd150', 'd180'].indexOf(a.bucket) + 1);
const weekOf = (a: ActionItem) => a.plan?.week ?? 4;
const planOrder = (a: ActionItem) => {
  const id = a.plan?.taskId;
  const n = id ? Number.parseFloat(id.replace(/[^0-9.]/g, '')) : Number.NaN;
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};
export const isTaskDone = (a: ActionItem) => a.status === 'done' || a.status === 'verified';
const isOpen = (a: ActionItem) => !isTaskDone(a) && a.status !== 'dismissed';
const pluginItem = (i: WorkItem) => PLUGIN_TYPES.includes(i.type as WpChangeType);
/**
 * Final: never sent again by this plan month's runs. A change covered by another task's identical
 * change is settled only once that one is.
 */
const settledIn = (items: WorkItem[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const own = (i: WorkItem) => ['verified', 'keep', 'skipped'].includes(i.status) && !(i.status === 'skipped' && i.reason?.startsWith('Failed twice'));
  return (i: WorkItem): boolean => {
    if (!i.coveredBy) return own(i);
    const w = byId.get(i.coveredBy);
    return Boolean(w && (w.status === 'verified' || w.status === 'keep'));
  };
};

/** Same page and same kind of change (titles, descriptions, an H1 fix, one block, one redirect…). */
function changeKey(i: WorkItem): string | null {
  if (!pluginItem(i)) return null;
  const v = (i.newValue ?? {}) as Record<string, unknown>;
  const sub = i.type === 'heading_fix' ? String(v.action ?? '') : i.type === 'content_block' ? String(v.block_id ?? '') : i.type === 'redirect_301' ? String(v.from ?? '') : i.type === 'create_page' ? String(v.slug ?? '') : '';
  return `${i.type}|${JSON.stringify(i.target ?? {})}|${sub}`;
}

/**
 * One change is made once, whichever tasks ask for it: "New titles for every page" and a later
 * "Fix the title on Contact" both write Contact's title, so the later task's change is marked as
 * covered by the earlier one (the one already made, else the one whose task comes first) and is not
 * sent. Its task is done when the covering change is.
 */
export function dedupeWorkItems(items: WorkItem[], actions: ActionItem[], month: number): WorkItem[] {
  const rank = new Map<string, number>([[SITE_TASK, -1]]);
  orderTasks(actions, month).forEach((a, i) => rank.set(a.id, i));
  for (const a of actions) if (!rank.has(a.id)) rank.set(a.id, isTaskDone(a) ? -2 : Number.MAX_SAFE_INTEGER);
  const title = new Map(actions.map((a) => [a.id, a.title]));
  const groups = new Map<string, WorkItem[]>();
  for (const i of items) {
    const k = changeKey(i);
    if (k && ['draft', 'applied', 'verified', 'keep'].includes(i.status)) groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const covered = new Map<string, string>();
  for (const g of groups.values()) {
    if (new Set(g.map((i) => i.actionId)).size < 2) continue;
    const made = g.find((i) => i.status === 'applied' || i.status === 'verified');
    const winner = made ?? [...g].sort((x, y) => (rank.get(x.actionId) ?? 0) - (rank.get(y.actionId) ?? 0))[0]!;
    for (const i of g) if (i !== winner && i.actionId !== winner.actionId && (i.status === 'draft' || i.status === 'keep')) covered.set(i.id, winner.id);
  }
  return items.map((i) => {
    const w = covered.get(i.id);
    if (!w) return i.coveredBy ? { ...i, coveredBy: undefined } : i;
    const win = items.find((x) => x.id === w)!;
    return { ...i, status: 'skipped' as const, coveredBy: w, reason: `Same change as ${win.actionId === SITE_TASK ? 'the site essentials' : `“${title.get(win.actionId) ?? 'another task'}”`}, so it is made once.` };
  });
}

/** Open tasks of this plan month and earlier, in the order they are done. */
export function orderTasks(actions: ActionItem[], month: number): ActionItem[] {
  return actions
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => isOpen(a) && monthOf(a) <= month)
    .sort((x, y) => monthOf(x.a) - monthOf(y.a) || weekOf(x.a) - weekOf(y.a) || (SEVERITY[x.a.severity] ?? 4) - (SEVERITY[y.a.severity] ?? 4) || planOrder(x.a) - planOrder(y.a) || x.index - y.index)
    .map(({ a }) => a);
}

/** Tasks this one waits for (its depends_on that are not done yet). */
export function waitingFor(a: ActionItem, actions: ActionItem[]): string[] {
  const byTaskId = new Map(actions.filter((x) => x.plan?.taskId).map((x) => [x.plan!.taskId, x]));
  return (a.plan?.dependsOn ?? []).filter((id) => {
    const dep = byTaskId.get(id);
    return dep ? !isTaskDone(dep) && dep.status !== 'dismissed' : false;
  });
}

/** Where a task stands, from its change items. `preparing`: the run is drafting this task's changes now. */
export function taskProgress(a: ActionItem, items: WorkItem[], opts: { preparing?: boolean; actions?: ActionItem[]; month?: number; week?: number } = {}): TaskProgress {
  const settled = settledIn(items);
  const mine = items.filter((i) => i.actionId === a.id);
  const plugin = mine.filter(pluginItem);
  const verified = plugin.filter(settled).length;
  const applied = plugin.filter((i) => i.status === 'applied').length;
  const failed = plugin.filter((i) => i.status === 'failed' || (i.status === 'skipped' && i.reason?.startsWith('Failed twice'))).length;
  const needsYou = mine.filter((i) => i.status === 'needs_human').length;
  const total = plugin.length;
  const base = { total, verified, applied, needsYou, failed };
  if (isTaskDone(a)) return { ...base, state: 'done', label: 'Done & verified' };
  const people = mine.filter((i) => ['team', 'client', 'developer'].includes(i.status));
  if (a.exec?.actionType === 'manual' || (!total && people.length && !needsYou)) {
    const who = a.exec?.manualFor ?? (people[0]?.status as 'team' | 'client' | 'developer' | undefined) ?? 'team';
    return { ...base, state: 'manual', label: `Manual (${who === 'client' ? 'you' : who === 'developer' ? 'developer' : 'our team'})` };
  }
  const wait = opts.actions ? waitingFor(a, opts.actions) : [];
  if (wait.length) return { ...base, state: 'waiting', waitingFor: wait, label: `Waiting for task ${wait.join(', ')}` };
  if (failed) return { ...base, state: 'failed', label: `Failed (${failed} change${failed === 1 ? '' : 's'})` };
  if (needsYou) return { ...base, state: 'needs_you', label: 'Needs you' };
  if (opts.preparing && !total) return { ...base, state: 'preparing', label: 'Preparing changes' };
  if (total && verified === total) return { ...base, state: 'done', label: 'Done & verified' };
  // "Applying" once something was actually sent; pages that were already right alone leave it queued.
  if (applied || plugin.some((i) => i.status === 'verified')) return { ...base, state: 'applying', label: `Applying (${verified + applied} of ${total})` };
  if (opts.month !== undefined && opts.week !== undefined && notYet(a, opts.month, opts.week)) return { ...base, state: 'later', label: `Planned for week ${weekOf(a)}` };
  return { ...base, state: 'queued', label: 'Queued' };
}

/** A task of this plan month whose week has not come yet (earlier months' tasks are overdue, never "later"). */
const notYet = (a: ActionItem, month: number, week: number) => monthOf(a) === month && weekOf(a) > week;

/** A task is finished when it has changes and every one is verified or already right. */
export function taskFinished(a: ActionItem, items: WorkItem[]): boolean {
  const plugin = items.filter((i) => i.actionId === a.id && pluginItem(i));
  return plugin.length > 0 && plugin.every(settledIn(items)) && !items.some((i) => i.actionId === a.id && i.status === 'needs_human');
}

export type ExecutionPlan = {
  /** Work item ids to send, in order. */
  order: string[];
  /** The tasks this run works on, in order, with what happens to each. */
  tasks: { id: string; title: string; step: 'apply' | 'waiting' | 'manual' | 'needs_you' | 'nothing' | 'later' }[];
};

/**
 * The run's queue: the site's own changes first, then each open task's ready changes in task order.
 * `onlyNext`: just the first task that has something to send ("Run next task now").
 * `requireApproval`: approve mode, only approved changes go out.
 */
export function executionPlan(actions: ActionItem[], items: WorkItem[], opts: { month: number; week?: number; onlyNext?: boolean; requireApproval?: boolean }): ExecutionPlan {
  const ready = (i: WorkItem) => i.status === 'draft' && pluginItem(i) && (!opts.requireApproval || Boolean(i.approvedAt));
  const order: string[] = [];
  const tasks: ExecutionPlan['tasks'] = [];
  const site = items.filter((i) => i.actionId === SITE_TASK && ready(i)).sort((a, b) => a.week - b.week || b.priority - a.priority);
  if (site.length && !opts.onlyNext) order.push(...site.map((i) => i.id));
  for (const a of orderTasks(actions, opts.month)) {
    const p = taskProgress(a, items, { actions });
    if (p.state === 'manual') {
      tasks.push({ id: a.id, title: a.title, step: 'manual' });
      continue;
    }
    if (p.state === 'waiting') {
      tasks.push({ id: a.id, title: a.title, step: 'waiting' });
      continue;
    }
    const mine = items.filter((i) => i.actionId === a.id && ready(i)).sort((x, y) => x.week - y.week || y.priority - x.priority);
    // Pacing: a task waits for its week of the plan month, so the month's work is spread over the
    // month. "Run next task now" (onlyNext) is a person's choice and may take it early.
    if (mine.length && !opts.onlyNext && opts.week !== undefined && notYet(a, opts.month, opts.week)) {
      tasks.push({ id: a.id, title: a.title, step: 'later' });
      continue;
    }
    if (!mine.length) {
      tasks.push({ id: a.id, title: a.title, step: p.state === 'needs_you' ? 'needs_you' : 'nothing' });
      continue;
    }
    tasks.push({ id: a.id, title: a.title, step: 'apply' });
    order.push(...mine.map((i) => i.id));
    if (opts.onlyNext) break;
  }
  // "Run next task now" with no task left: the site's own changes go instead.
  if (opts.onlyNext && !order.length) order.push(...site.map((i) => i.id));
  return { order, tasks };
}

/** The week (1–4) of the plan month we are in: 30-day months from the plan's start; days 29–30 count as week 4. */
export function planWeek(start: Date | null, month: number, now = new Date()): number {
  if (!start) return 4;
  const monthStart = start.getTime() + (month - 1) * 30 * 86_400_000;
  return Math.max(1, Math.min(4, Math.floor((now.getTime() - monthStart) / (7 * 86_400_000)) + 1));
}
