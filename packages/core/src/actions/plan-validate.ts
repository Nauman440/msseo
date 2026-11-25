import type { AiPlan, AiPlanTask, PlanCapacity, TaskCategory } from './ai-plan';
import type { CleanupItem, CleanupPage } from './cleanup';
import type { NeedsDeveloper, PlanIssue } from './plan-prompt';
import type { TopUpCandidate } from './plan-topup';
import { isAiCheck, sameWork } from './plan-dedupe';

/**
 * The plan prompt's RULES 1–10, in code: repairs what can be repaired from the site's own findings
 * (every issue scheduled, Critical and High in months 1–2, two AI-search tasks a month, two off-page
 * tasks in months 2–6, at least 12 tasks a month, no developer tasks, dependencies pointing back), then
 * prints PASS/FAIL for every rule.
 */
export type ValidationLine = { check: string; pass: boolean; detail: string };
type MonthTask = AiPlanTask & { month: number };

/** Rule 1: the fewest tasks in a month. */
export const MIN_TASKS = 12;
/** Rule 10. */
export const MAX_WORDS = 25;
/** A plan writer that has reported no progress for this long has stopped (server restart). */
export const PLAN_STALL_MS = 35 * 60_000;
export const planStillWriting = (s: { state: string; startedAt: string; updatedAt?: string } | null | undefined, now = Date.now()) =>
  s?.state === 'writing' && now - Date.parse(s.updatedAt ?? s.startedAt) < PLAN_STALL_MS;

const ITEM_LABEL: Record<CleanupItem, string> = {
  meta_title: 'meta titles', meta_description: 'meta descriptions', canonical: 'canonical tags', alt_text: 'image alt text', h1: 'heading structure (H1/H2)', schema: 'schema', open_graph: 'Open Graph tags',
};
/** Rule 4's six Month 1 batches (Open Graph is our own extra). */
export const RULE4_ITEMS: CleanupItem[] = ['meta_title', 'meta_description', 'canonical', 'alt_text', 'h1', 'schema'];
const URGENT = new Set(['Critical', 'High']);
/** Rule 4 of the plan prompt: crawl/index blockers, broken links, redirects, sitemap and tracking. */
export const BLOCKER_TASK = /\b(noindex|robots\.txt|blocked|not indexed|indexing|sitemap|broken (pages?|links?)|404|5\d\d|server errors?|crawl(ing)? errors?|redirect chains?|redirects? loops?|tracking)\b/i;
const BLOCKER = BLOCKER_TASK;
const priorityOf = (i: number, c: number, e: number) => Math.round(((i * c) / Math.max(1, e)) * 10) / 10;
const blank = (o: Partial<AiPlanTask> & Pick<AiPlanTask, 'title' | 'why' | 'change' | 'category'>): AiPlanTask => ({
  id: 'x', week: 2, urls: [], keywords: [], doer: 'team', impact: 3, confidence: 3, effort: 2, priority: 0, depends_on: [], success_check: 'Checked at the next audit.',
  check_after_days: 14, site_wide_item: 'none', page_group: 'none', area: '', issue_ids: [], recurring: false, ...o,
});
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clip = (s: string, n: number) => {
  const w = s.trim().split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(' ').replace(/[,;:.]$/, '')}…` : s;
};

function categoryOfIssue(i: PlanIssue): TaskCategory {
  if (/^2\.8\.|^1\.2\.4/.test(i.issue_id)) return 'ai_visibility';
  if (/^2\.(4|9)\./.test(i.issue_id)) return 'content';
  if (i.item === 'canonical' || i.item === 'schema' || BLOCKER.test(i.issue)) return 'technical';
  if (i.item || /^2\./.test(i.issue_id)) return 'on_page';
  return 'technical';
}

/** A task for an issue the plan left out (the issue's own text, its fix and its pages). */
export function issueTask(i: PlanIssue): AiPlanTask {
  const impact = i.severity === 'Critical' ? 5 : i.severity === 'High' ? 4 : i.severity === 'Medium' ? 3 : 2;
  const category = categoryOfIssue(i);
  return blank({
    title: clip(`Fix: ${i.issue}`, 14), why: `${i.affected_url_count} page(s) affected (${i.severity}).`, change: clip(i.fix, MAX_WORDS - 1),
    category, urls: i.example_urls.slice(0, 5), impact, confidence: 4, effort: 2, priority: priorityOf(impact, 4, 2), issue_ids: [i.issue_id],
    week: category === 'technical' && BLOCKER.test(i.issue) ? 1 : 2, success_check: 'The next audit shows this issue fixed.',
  });
}

/** Rule 5: the AI-visibility baseline (Month 1) and the monthly re-test. */
export function aiRetestTask(month: number, questions: number): AiPlanTask {
  return blank({
    title: month === 1 ? 'AI-visibility baseline: ask buyer questions in AI assistants' : `AI-visibility re-test (month ${month})`,
    why: month === 1 ? 'Shows where AI assistants name the business today, so progress can be measured.' : 'Shows whether this month’s work got the business named in more AI answers.',
    change: `Ask the ${questions || 20} tracked buyer questions in ChatGPT, Perplexity and Google AI Overviews; record mentions and cited sites.`,
    category: 'ai_visibility', week: month === 1 ? 1 : 4, impact: 3, confidence: 4, effort: 1, priority: priorityOf(3, 4, 1), recurring: month > 1,
    success_check: month === 1 ? 'Baseline share of voice recorded.' : 'Share of voice compared with last month.', check_after_days: 28,
  });
}

export type RepairContext = {
  issues: PlanIssue[];
  needsDeveloper: NeedsDeveloper[];
  /** max(12, the plan tier's minimum). */
  target: number;
  /** Findings to plan when a month is short (plan-topup.ts). */
  extra: TopUpCandidate[];
  questions: number;
};

/** Issue ids a task fixes, by id or because the task is the issue's Month 1 batch. */
function scheduledIds(all: AiPlanTask[], nd: NeedsDeveloper[], issues: PlanIssue[]) {
  const ids = new Set([...all.flatMap((t) => t.issue_ids), ...nd.map((n) => n.issue_id)]);
  const items = new Set<string>(all.map((t) => t.site_wide_item));
  for (const i of issues) if (i.item && items.has(i.item)) ids.add(i.issue_id);
  return ids;
}

/** Repairs the month lists in place before ids are renumbered; returns notes on what changed. */
export function repairPlan(all: MonthTask[], ctx: RepairContext): string[] {
  const notes: string[] = [];
  const month = (m: number) => all.filter((t) => t.month === m);
  const leastBusy = (from: number, to: number) => [...Array(to - from + 1).keys()].map((i) => i + from).sort((a, b) => month(a).length - month(b).length || a - b)[0]!;

  // Rule 3: no developer tasks; they go to "needs_developer".
  for (const t of all.filter((x) => x.doer === 'developer')) {
    all.splice(all.indexOf(t), 1);
    ctx.needsDeveloper.push({ issue_id: t.issue_ids[0] ?? '', issue: t.title, reason: 'Needs a developer: no no-code route was given.' });
    notes.push(`"${t.title}" needs a developer: moved to "needs developer".`);
  }

  // Rule 2: Critical and High in months 1–2; every issue in a task.
  for (const i of ctx.issues.filter((x) => URGENT.has(x.severity))) {
    for (const t of all.filter((x) => x.issue_ids.includes(i.issue_id) && x.month > 2)) {
      notes.push(`Moved "${t.title}" to month 2: it fixes a ${i.severity.toLowerCase()} issue (${i.issue_id}).`);
      t.month = 2;
    }
  }
  const done = scheduledIds(all, ctx.needsDeveloper, ctx.issues);
  let added = 0;
  for (const i of ctx.issues) {
    if (done.has(i.issue_id)) continue;
    const m = i.severity === 'Critical' ? 1 : i.severity === 'High' ? leastBusy(1, 2) : leastBusy(2, 6);
    all.push({ ...issueTask(i), month: m });
    done.add(i.issue_id);
    added++;
  }
  if (added) notes.push(`Added ${added} task(s) for issues the plan had not scheduled.`);

  // Rules 5, 6, 1: AI search twice a month, off-page twice in months 2–6, the monthly total.
  // One task per page and kind of work; AI-search tasks differ by what they add (answer, FAQ, table…).
  const keyOf = (t: AiPlanTask) => (t.urls.length && t.category !== 'ai_visibility' ? t.urls.map((u) => `${t.category}|${u.toLowerCase()}`) : [`${t.category}|${t.title.toLowerCase()}`]);
  const used = new Set(all.flatMap(keyOf));
  const pool = ctx.extra
    .filter((c) => !keyOf(c.task).some((k) => used.has(k)))
    .sort((a, b) => priorityOf(b.task.impact, b.task.confidence, b.task.effort) - priorityOf(a.task.impact, a.task.confidence, a.task.effort));
  // A finding the plan already covers (same issue, or the same work on the same pages) is never added again.
  const covered = (c: TopUpCandidate) => c.task.issue_ids.some((i) => done.has(i)) || all.some((t) => sameWork(t, c.task));
  const pull = (m: number, of?: TaskCategory[]): AiPlanTask | null => {
    const i = pool.findIndex((c) => c.earliest <= m && (c.only === undefined || c.only === m) && (!of || of.includes(c.task.category)) && !keyOf(c.task).some((k) => used.has(k)) && !covered(c));
    if (i < 0) return null;
    const t = pool.splice(i, 1)[0]!.task;
    for (const k of keyOf(t)) used.add(k);
    return { ...t, priority: priorityOf(t.impact, t.confidence, t.effort) };
  };
  const fill = (m: number, of: TaskCategory[] | undefined, min: number) => {
    let n = 0;
    while ((of ? month(m).filter((t) => of.includes(t.category)).length : month(m).length) < min) {
      const t = pull(m, of);
      if (!t) break;
      all.push({ ...t, id: `${m}.added-${all.length}`, month: m });
      n++;
    }
    return n;
  };
  let topped = 0;
  for (let m = 1; m <= 6; m++) {
    if (!month(m).some(isAiCheck)) {
      all.push({ ...aiRetestTask(m, ctx.questions), id: `${m}.retest`, month: m });
      topped++;
    }
    topped += fill(m, ['ai_visibility'], 2);
    if (m > 1) topped += fill(m, ['off_page'], 2);
    topped += fill(m, ['content'], 1);
    topped += fill(m, ['technical', 'on_page'], 1);
    topped += fill(m, undefined, ctx.target);
  }
  if (topped) notes.push(`Added ${topped} task(s) from the site's findings so each month meets the plan rules.`);
  const short = [1, 2, 3, 4, 5, 6].filter((m) => month(m).length < MIN_TASKS);
  if (short.length) notes.push(`Month${short.length > 1 ? 's' : ''} ${short.join(', ')} still hold${short.length > 1 ? '' : 's'} fewer than ${MIN_TASKS} tasks: there were no more findings to plan (no filler).`);
  return notes;
}

/** Dependencies may only point to earlier tasks (after ids are renumbered "<month>.<nn>"). */
export function fixDependencies(plan: AiPlan): number {
  let dropped = 0;
  const order = new Map<string, number>();
  let n = 0;
  for (const m of plan.months) for (const t of m.tasks) order.set(t.id, n++);
  for (const m of plan.months) {
    for (const t of m.tasks) {
      const before = t.depends_on.length;
      t.depends_on = t.depends_on.filter((d) => (order.get(d) ?? Infinity) < order.get(t.id)!);
      dropped += before - t.depends_on.length;
    }
  }
  return dropped;
}

export function validatePlan(plan: AiPlan, ctx: { issues: PlanIssue[]; needsDeveloper: NeedsDeveloper[]; pages: CleanupPage[]; capacity: PlanCapacity; banned: string[]; pageMeta?: { url: string; title: string; description: string }[]; listedUrls?: string[]; metaReview?: { url: string; field: string }[] }): ValidationLine[] {
  const lines: ValidationLine[] = [];
  const add = (check: string, pass: boolean, detail: string) => lines.push({ check, pass, detail });
  const tasks = plan.months.flatMap((m) => m.tasks.map((t) => ({ ...t, month: m.month })));

  const present = [1, 2, 3, 4, 5, 6].filter((m) => plan.months.some((x) => x.month === m));
  add('1. Exactly 6 months', present.length === 6 && plan.months.length === 6, `months: ${present.join(', ')}`);
  for (const m of plan.months) {
    const count = (of: TaskCategory[]) => m.tasks.filter((t) => of.includes(t.category)).length;
    const aeo = count(['ai_visibility']);
    const off = count(['off_page']);
    const tech = count(['technical', 'on_page', 'tracking']);
    const content = count(['content']);
    const ok = m.tasks.length >= MIN_TASKS && aeo >= 2 && (m.month === 1 || off >= 2) && tech >= 1 && content >= 1;
    add(`Month ${m.month}: ≥ ${MIN_TASKS} tasks, ≥ 2 AEO${m.month > 1 ? ', ≥ 2 off-page' : ''}, technical or on-page, content`, ok,
      `${m.tasks.length} tasks; AEO ${aeo}, off-page ${off}, technical/on-page ${tech}, content ${content}`);
  }

  const done = scheduledIds(tasks, ctx.needsDeveloper, ctx.issues);
  const missing = ctx.issues.filter((i) => !done.has(i.issue_id));
  add('2. Every issue_id and site_check problem is in a task (or needs a developer)', !missing.length, missing.length ? `missing: ${missing.map((i) => i.issue_id).join(', ')}` : `${ctx.issues.length} issues covered`);
  const urgent = ctx.issues.filter((i) => URGENT.has(i.severity) && !ctx.needsDeveloper.some((n) => n.issue_id === i.issue_id));
  const late = urgent.filter((i) => {
    const own = tasks.filter((t) => t.issue_ids.includes(i.issue_id) || (i.item && t.site_wide_item === i.item));
    return !own.length || own.every((t) => t.month > 2);
  });
  add('2. Critical and High issues are in Months 1–2', !late.length, late.length ? `later: ${late.map((i) => i.issue_id).join(', ')}` : `${urgent.length} Critical/High issues`);

  const dev = tasks.filter((t) => t.doer === 'developer');
  add('3. No developer tasks', !dev.length, dev.length ? dev.map((t) => t.id).join(', ') : `${ctx.needsDeveloper.length} item(s) listed as needing a developer`);

  const needed = new Set(ctx.pages.flatMap((p) => p.needs));
  const month1 = tasks.filter((t) => t.month === 1);
  const absent = RULE4_ITEMS.filter((it) => needed.has(it) && !month1.some((t) => t.site_wide_item === it));
  add('4. Month 1 has separate tasks for meta titles, meta descriptions, canonicals, alt text, headings and schema', !absent.length,
    absent.length ? `missing: ${absent.map((i) => ITEM_LABEL[i]).join(', ')}` : RULE4_ITEMS.map((it) => `${ITEM_LABEL[it]} ${needed.has(it) ? month1.filter((t) => t.site_wide_item === it).length : 'not needed'}`).join(', '));
  const blockers = tasks.filter((t) => t.category === 'technical' && BLOCKER.test(`${t.title} ${t.change}`) && !t.recurring && t.site_wide_item === 'none');
  const lateBlockers = blockers.filter((t) => t.month > 1 || t.week > 2);
  add('4. Crawl/index blockers, broken links, redirects, sitemap and tracking in Month 1, weeks 1–2', !lateBlockers.length, lateBlockers.length ? `later: ${lateBlockers.map((t) => t.id).join(', ')}` : `${blockers.length} task(s)`);

  const order = new Map(tasks.map((t, i) => [t.id, i]));
  const badDeps = tasks.filter((t) => t.depends_on.some((d) => (order.get(d) ?? Infinity) >= order.get(t.id)!));
  add('9. Dependencies only on earlier tasks', !badDeps.length, badDeps.length ? badDeps.map((t) => t.id).join(', ') : `${tasks.length} tasks`);
  const over = plan.months.filter((m) => m.tasks.filter((t) => t.doer === 'automatic' && t.site_wide_item === 'none').length > ctx.capacity.automatic);
  add('9. Within the monthly capacity', !over.length, over.length ? `months over the automatic-change limit: ${over.map((m) => m.month).join(', ')}` : `≤ ${ctx.capacity.automatic} automatic changes, ${ctx.capacity.newPages} new pages, ${ctx.capacity.articles} articles a month`);
  const banned = ctx.banned.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const hits = banned.length ? tasks.flatMap((t) => banned.filter((w) => `${t.title} ${t.why} ${t.change}`.toLowerCase().includes(w))) : [];
  add('9. No banned words', !hits.length, banned.length ? (hits.length ? `found: ${[...new Set(hits)].join(', ')}` : `${banned.length} checked`) : 'none given');

  const long = tasks.filter((t) => [t.title, t.why, t.change, t.success_check].some((s) => words(s) > MAX_WORDS));
  add(`10. Every text field under ${MAX_WORDS} words`, !long.length, long.length ? `${long.length} task(s) with a longer field: ${long.slice(0, 8).map((t) => t.id).join(', ')}` : `${tasks.length} tasks`);
  if (ctx.listedUrls) {
    const rows = ctx.pageMeta ?? [];
    const keep = (v: string) => !v.trim() || v.trim().toLowerCase() === 'keep';
    const missing = ctx.listedUrls.length - rows.length;
    const badTitle = rows.filter((r) => !keep(r.title) && (r.title.length < 50 || r.title.length > 60));
    const badMeta = rows.filter((r) => !keep(r.description) && (r.description.length < 140 || r.description.length > 155));
    const dup = (vals: string[]) => vals.length - new Set(vals.map((v) => v.toLowerCase())).size;
    const dups = dup(rows.filter((r) => !keep(r.title)).map((r) => r.title)) + dup(rows.filter((r) => !keep(r.description)).map((r) => r.description));
    add('11. Month 1: a new title (50–60) and description (140–155) for every page', !missing && !badTitle.length && !badMeta.length && !dups,
      `${rows.length} of ${ctx.listedUrls.length} pages; ${rows.filter((r) => !keep(r.title)).length} new titles, ${rows.filter((r) => !keep(r.description)).length} new descriptions; out of range: ${badTitle.length} titles, ${badMeta.length} descriptions; duplicates: ${dups}; for review: ${ctx.metaReview?.length ?? 0}`);
  }
  return lines;
}

export const validationText = (lines: ValidationLine[]) =>
  [...lines.map((l) => `${l.pass ? 'PASS' : 'FAIL'}  ${l.check}\n      ${l.detail}`), '', `${lines.filter((l) => l.pass).length} of ${lines.length} checks pass.`].join('\n');
