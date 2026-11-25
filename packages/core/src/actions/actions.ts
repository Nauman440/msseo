import type { ApplyRecord } from '../connections/types';
import type { StoredAiPlan, TaskCategory, TaskDoer } from './ai-plan';
import type { PageGroup, SiteWideItem } from './cleanup';
import type { MappingRow, MappingWorkspace } from '../mapping/mapping';
import type { Ice, ReportIssue, ReportModel, Severity } from '../types';

/**
 * Module 12 · Prioritisation and action plan (spec §16.2). One plan per website: every finding
 * from the audit (Modules 1–2) and the page plan (Module 5) can become an action with owner, due
 * date, approval, a before-state snapshot and verification at 7/14/28 days, grouped into a
 * 30/60/90-day roadmap.
 */
export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'verified' | 'dismissed';
export type Approval = 'none' | 'team_lead' | 'client';
/** Roadmap months: d30 = month 1 (days 1–30) … d180 = month 6. Plans before 2026-11-20 only used the first three. */
export type Bucket = 'd30' | 'd60' | 'd90' | 'd120' | 'd150' | 'd180';
export const ACTION_BUCKETS: Bucket[] = ['d30', 'd60', 'd90', 'd120', 'd150', 'd180'];
export type ActionSource = { kind: 'audit'; ruleId: string } | { kind: 'mapping'; clusterId: string } | { kind: 'ai'; planId: string; taskId: string };

/** What the AI plan says about a task (ai-plan.ts): who does it, when, what changes and how success is checked. */
export type PlanTaskInfo = {
  taskId: string;
  month: number;
  week: number;
  doer: TaskDoer;
  category: TaskCategory;
  why: string;
  change: string;
  keywords: string[];
  dependsOn: string[];
  successCheck: string;
  checkAfterDays: number;
  /** Rules 20–23: a site-wide clean-up task (older plans have none). */
  siteWideItem?: SiteWideItem;
  pageGroup?: PageGroup;
  /** Audit area A–Q, issue register ids and whether it repeats (plans from 2026-11-24 on). */
  area?: string;
  issueIds?: string[];
  recurring?: boolean;
  /** Bug 8: owner-friendly group(s) of a site-wide batch ("Product pages") and every page with before/after. */
  groupLabel?: string;
  pages?: PlanPageRow[];
};
/** One page a site-wide task changes, with its name on the site. */
export type PlanPageRow = { url: string; name: string; before: string; after: string };

export type BeforeState = {
  capturedAt: string;
  auditId: string | null;
  score: number | null;
  /** The finding as it was: rule status and how many pages were affected. */
  affected: number | null;
  applicable: number | null;
  pages: { url: string; title: string | null; h1: string | null }[];
  /** Search Console clicks/impressions of the action's pages, last 3 months (when connected). */
  gsc: { clicks: number; impressions: number } | null;
};

export type CheckpointResult = {
  checkedAt: string;
  auditId: string | null;
  /** Pages still affected in the latest audit (null when no audit ran since the fix). */
  affectedNow: number | null;
  /** Clicks per day after vs before, for the action's pages and for the rest of the site. */
  targetChange: number | null;
  controlChange: number | null;
  verdict: 'fixed' | 'improved' | 'no_change' | 'worse' | 'waiting';
  note: string;
};
export type Checkpoint = { day: 7 | 14 | 28; dueAt: string; result: CheckpointResult | null };

export type ActionItem = {
  id: string;
  source: ActionSource;
  title: string;
  detail: string;
  severity: Exclude<Severity, 'info'>;
  impact: number;
  confidence: number;
  effort: number;
  /** impact × confidence ÷ effort (0.2–25). */
  priority: number;
  urls: string[];
  owner: string | null;
  dueDate: string | null;
  approval: Approval;
  approvedAt: string | null;
  approvedBy: string | null;
  status: ActionStatus;
  bucket: Bucket;
  bucketLocked: boolean;
  before: BeforeState | null;
  doneAt: string | null;
  checkpoints: Checkpoint[];
  /** Exact page changes to make (from the one-page keyword map): what is there now and what replaces it. */
  changes?: PageChange[];
  /** Applied to the connected WordPress or Shopify site (spec §16.5), with undo information. */
  applied?: ApplyRecord | null;
  /** Set on tasks from the AI-written plan. */
  plan?: PlanTaskInfo;
  createdAt: string;
  updatedAt: string;
};
/** `data`: structured values for applying (a new page’s address, title, meta and HTML skeleton). */
export type PageChange = { id: string; label: string; now: string; suggested: string; data?: Record<string, string> };

export type ActionWorkspace = {
  domain: string;
  actions: ActionItem[];
  updatedAt: string | null;
  /** The AI-written 6-month plan (its tasks are the actions with `source.kind === 'ai'`). */
  aiPlan?: StoredAiPlan | null;
  /** The AI plan being written in the background (step shown on the page), or why the last try failed. */
  aiPlanStatus?: { state: 'writing' | 'failed'; step: string; startedAt: string; /** Last progress update; a writer silent for 35 minutes has stopped. */ updatedAt?: string; message?: string } | null;

};
export const emptyActions = (domain: string): ActionWorkspace => ({ domain, actions: [], updatedAt: null });

export const actionKey = (s: ActionSource) => (s.kind === 'audit' ? `audit:${s.ruleId}` : s.kind === 'mapping' ? `mapping:${s.clusterId}` : `ai:${s.planId}:${s.taskId}`);
export const priorityOf = (i: number, c: number, e: number) => Math.round(((i * c) / Math.max(1, e)) * 10) / 10;
const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/** A suggestion that can become an action (12.1). */
export type Suggestion = Omit<ActionItem, 'id' | 'owner' | 'dueDate' | 'approval' | 'approvedAt' | 'approvedBy' | 'status' | 'bucket' | 'bucketLocked' | 'before' | 'doneAt' | 'checkpoints' | 'createdAt' | 'updatedAt'> & {
  /** Overrides the default approval level (fixes sent from the page map always need the client). */
  approval?: Approval;
};

export function fromIssue(i: ReportIssue): Suggestion {
  const ice: Ice = i.ice;
  return {
    source: { kind: 'audit', ruleId: i.ruleId },
    title: i.title.client,
    detail: `${i.message.client}. ${i.fix.client}`,
    severity: i.severity === 'info' ? 'low' : i.severity,
    impact: ice.impact,
    confidence: ice.confidence,
    effort: ice.effort,
    priority: priorityOf(ice.impact, ice.confidence, ice.effort),
    urls: i.urls.slice(0, 20),
  };
}

const MAPPING_TITLE: Record<MappingRow['action'], (r: MappingRow) => string> = {
  create: (r) => `Create a page for "${r.primaryKeyword}"`,
  optimise: (r) => `Optimise the page for "${r.primaryKeyword}"`,
  expand: (r) => `Expand the page for "${r.primaryKeyword}"`,
  merge: (r) => `Merge the pages competing for "${r.primaryKeyword}"`,
  leave: (r) => `Keep "${r.primaryKeyword}" in the top 3`,
};
const MAPPING_EFFORT: Record<MappingRow['action'], number> = { create: 4, expand: 3, merge: 3, optimise: 2, leave: 1 };

export function fromMappingRow(r: MappingRow): Suggestion {
  // Topic priority (value × chance, 1–25) becomes impact; the page plan is fairly sure of its pick.
  const impact = clamp(r.priority / 5);
  const confidence = r.url ? 4 : 3;
  const effort = MAPPING_EFFORT[r.action];
  const changes = [
    r.drafts ? `New title: "${r.drafts.title}".` : '',
    r.linksToAdd.length ? `Add links from ${r.linksToAdd.length} related page${r.linksToAdd.length === 1 ? '' : 's'}.` : '',
    r.schemaNeeded.length ? `Add schema: ${r.schemaNeeded.join(', ')}.` : '',
  ].filter(Boolean);
  return {
    source: { kind: 'mapping', clusterId: r.clusterId },
    title: MAPPING_TITLE[r.action](r),
    detail: [r.reason + '.', ...changes].join(' '),
    severity: r.priority >= 16 ? 'high' : r.priority >= 9 ? 'medium' : 'low',
    impact,
    confidence,
    effort,
    priority: priorityOf(impact, confidence, effort),
    urls: [r.url, ...r.conflicts.map((c) => c.url)].filter((u): u is string => Boolean(u)),
  };
}

/** 12.1 Everything that could become an action and is not one yet, highest priority first. */
export function suggestions(ws: ActionWorkspace, report?: ReportModel | null, mapping?: MappingWorkspace | null): Suggestion[] {
  const taken = new Set(ws.actions.map((a) => actionKey(a.source)));
  const fromAudit = (report?.issues ?? []).filter((i) => i.severity !== 'info' && (i.status === 'fail' || i.status === 'warn')).map(fromIssue);
  const fromPlan = (mapping?.rows ?? []).filter((r) => r.action !== 'leave' && r.status !== 'live' && r.status !== 'verified').map(fromMappingRow);
  return [...fromAudit, ...fromPlan].filter((s) => !taken.has(actionKey(s.source))).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

/** 12.5 The state before the fix: the finding's numbers, the pages' titles and Search Console clicks. */
export function beforeState(s: Suggestion, report: ReportModel | null | undefined, gsc: { url: string; clicks: number; impressions: number }[] | null, now: Date): BeforeState {
  const issue = s.source.kind === 'audit' ? report?.issues?.find((i) => i.ruleId === (s.source as { ruleId: string }).ruleId) : undefined;
  const wanted = new Set(s.urls.map(normUrl));
  const pages = (report?.pages ?? []).filter((p) => wanted.has(normUrl(p.url))).slice(0, 10).map((p) => ({ url: p.url, title: p.title, h1: p.h1 }));
  const mine = gsc?.filter((g) => wanted.has(normUrl(g.url))) ?? null;
  return {
    capturedAt: now.toISOString(),
    auditId: report?.auditId ?? null,
    score: report?.overall.score ?? null,
    affected: issue ? issue.affectedCount ?? (issue.urls.length || 1) : null,
    applicable: issue?.applicableCount ?? null,
    pages,
    gsc: mine && gsc?.length ? { clicks: mine.reduce((x, g) => x + g.clicks, 0), impressions: mine.reduce((x, g) => x + g.impressions, 0) } : null,
  };
}

/**
 * 12.7 A six-month plan: open actions by priority, spread evenly over months 1–6 (at least 5 a month,
 * so a short list stays in the first months); hard work (effort 4–5) moves one month later.
 */
export function assignBuckets(actions: ActionItem[]): ActionItem[] {
  const open = actions.filter((a) => a.status !== 'dismissed' && !a.bucketLocked).sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
  const perMonth = Math.max(5, Math.ceil(open.length / ACTION_BUCKETS.length));
  const last = ACTION_BUCKETS.length - 1;
  const bucket = new Map<string, Bucket>();
  open.forEach((a, i) => {
    let n = Math.min(last, Math.floor(i / perMonth));
    if (a.effort >= 4 && n < last) n++;
    bucket.set(a.id, ACTION_BUCKETS[n]!);
  });
  return actions.map((a) => (bucket.has(a.id) ? { ...a, bucket: bucket.get(a.id)! } : a));
}

const BUCKET_DAYS: Record<Bucket, number> = { d30: 30, d60: 60, d90: 90, d120: 120, d150: 150, d180: 180 };

/**
 * 12.1–12.7 for customers: every finding of the latest audit and every page-plan topic becomes an
 * action at once, spread over six months. Returns null when nothing is new.
 */
export function autoPlan(
  ws: ActionWorkspace,
  report: ReportModel | null,
  mapping: MappingWorkspace | null,
  ctx: { gsc?: { url: string; clicks: number; impressions: number }[] | null; newId: () => string; now?: Date },
): ActionWorkspace | null {
  const picks = suggestions(ws, report, mapping);
  if (!picks.length) return null;
  return addActions(ws, picks, { ...ctx, report });
}

/** 12.1–12.2 Adds suggestions as actions (approval by the client for new pages and merges, else none). */
export function addActions(
  ws: ActionWorkspace,
  picks: Suggestion[],
  ctx: { report?: ReportModel | null; gsc?: { url: string; clicks: number; impressions: number }[] | null; newId: () => string; now?: Date },
): ActionWorkspace {
  const now = ctx.now ?? new Date();
  const iso = now.toISOString();
  const taken = new Set(ws.actions.map((a) => actionKey(a.source)));
  const added: ActionItem[] = picks
    .filter((p) => !taken.has(actionKey(p.source)))
    .map((p) => ({
      ...p,
      id: ctx.newId(),
      owner: null,
      dueDate: null,
      // Visible changes to the client's site need their yes: new pages and merges (redirects).
      approval: p.approval ?? (p.source.kind === 'mapping' && /^(Create|Merge)/.test(p.title) ? 'client' : 'none'),
      approvedAt: null,
      approvedBy: null,
      status: 'todo',
      bucket: 'd30',
      bucketLocked: false,
      before: beforeState(p, ctx.report, ctx.gsc ?? null, now),
      doneAt: null,
      checkpoints: [],
      createdAt: iso,
      updatedAt: iso,
    }));
  const actions = assignBuckets([...ws.actions, ...added]).map((a) =>
    a.dueDate || a.status === 'done' || a.status === 'verified' ? a : { ...a, dueDate: new Date(Date.parse(a.createdAt) + BUCKET_DAYS[a.bucket] * 86_400_000).toISOString().slice(0, 10) },
  );
  return { ...ws, actions, updatedAt: iso };
}

/**
 * "Send fixes to approvals" (one-page keyword map): one action per page plan topic holding the exact
 * changes. Sending again replaces the changes and asks for approval again when they differ.
 */
export function upsertPageChanges(
  ws: ActionWorkspace,
  s: Suggestion,
  changes: PageChange[],
  ctx: { report?: ReportModel | null; gsc?: { url: string; clicks: number; impressions: number }[] | null; newId: () => string; now?: Date },
): ActionWorkspace {
  const now = ctx.now ?? new Date();
  const key = actionKey(s.source);
  const existing = ws.actions.find((a) => actionKey(a.source) === key);
  if (!existing) {
    const next = addActions(ws, [{ ...s, approval: 'client' }], ctx);
    return { ...next, actions: next.actions.map((a) => (actionKey(a.source) === key ? { ...a, changes } : a)) };
  }
  const same = JSON.stringify(existing.changes ?? []) === JSON.stringify(changes);
  const reopened = existing.status === 'dismissed' || existing.status === 'done' || existing.status === 'verified';
  return {
    ...ws,
    updatedAt: now.toISOString(),
    actions: ws.actions.map((a) =>
      a.id !== existing.id
        ? a
        : {
            ...a,
            changes,
            detail: s.detail,
            approval: 'client',
            ...(same ? {} : { approvedAt: null, approvedBy: null }),
            ...(reopened && !same ? { status: 'todo' as const, doneAt: null, checkpoints: [] } : {}),
            updatedAt: now.toISOString(),
          },
    ),
  };
}

/** 12.6 Checkpoints 7, 14 and 28 days after the fix. */
export const checkpointsFrom = (doneAt: Date): Checkpoint[] =>
  ([7, 14, 28] as const).map((day) => ({ day, dueAt: new Date(doneAt.getTime() + day * 86_400_000).toISOString(), result: null }));

export type ActionPatch = Partial<Pick<ActionItem, 'owner' | 'dueDate' | 'approval' | 'status' | 'bucket' | 'title'>> & { approve?: { by: string } };

/** 12.4 owner, due date, approval; status changes start (or clear) verification. */
export function updateAction(ws: ActionWorkspace, id: string, patch: ActionPatch, now = new Date()): ActionWorkspace {
  const iso = now.toISOString();
  return {
    ...ws,
    updatedAt: iso,
    actions: ws.actions.map((a) => {
      if (a.id !== id) return a;
      const next: ActionItem = { ...a, updatedAt: iso };
      if (patch.owner !== undefined) next.owner = patch.owner?.trim().slice(0, 80) || null;
      if (patch.dueDate !== undefined) next.dueDate = patch.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? patch.dueDate : null;
      if (patch.approval) next.approval = patch.approval;
      if (patch.title) next.title = patch.title.trim().slice(0, 160);
      if (patch.bucket && patch.bucket !== a.bucket) Object.assign(next, { bucket: patch.bucket, bucketLocked: true });
      if (patch.approve) Object.assign(next, { approvedAt: iso, approvedBy: patch.approve.by.slice(0, 80) });
      if (patch.status && patch.status !== a.status) {
        next.status = patch.status;
        if (patch.status === 'done' && !a.doneAt) Object.assign(next, { doneAt: iso, checkpoints: checkpointsFrom(now) });
        if (patch.status === 'todo' || patch.status === 'in_progress') Object.assign(next, { doneAt: null, checkpoints: [] });
      }
      return next;
    }),
  };
}

/** Waiting for someone's approval before work can start. */
export const needsApproval = (a: ActionItem, by?: Approval) => a.status !== 'dismissed' && a.approval !== 'none' && !a.approvedAt && (!by || a.approval === by);

/**
 * 12.6 One checkpoint: is the finding gone in the newest audit, and did the action's pages gain
 * clicks compared with the rest of the site (control pages)?
 */
export function judgeCheckpoint(
  a: ActionItem,
  latest: { report: ReportModel | null; finishedAt: string | null },
  clicks: { targetBefore: number; targetAfter: number; controlBefore: number; controlAfter: number } | null,
  now: Date,
): CheckpointResult {
  const freshAudit = latest.report && latest.finishedAt && a.doneAt && Date.parse(latest.finishedAt) > Date.parse(a.doneAt) ? latest.report : null;
  let affectedNow: number | null = null;
  if (freshAudit && a.source.kind === 'audit') {
    const ruleId = a.source.ruleId;
    const issue = freshAudit.issues?.find((i) => i.ruleId === ruleId);
    affectedNow = issue ? issue.affectedCount ?? (issue.urls.length || 1) : 0;
  }
  const pct = (before: number, after: number) => (before > 0 ? Math.round(((after - before) / before) * 100) : after > 0 ? 100 : 0);
  const targetChange = clicks ? pct(clicks.targetBefore, clicks.targetAfter) : null;
  const controlChange = clicks ? pct(clicks.controlBefore, clicks.controlAfter) : null;
  const lift = targetChange !== null && controlChange !== null ? targetChange - controlChange : null;
  const before = a.before?.affected ?? null;

  let verdict: CheckpointResult['verdict'] = 'waiting';
  const notes: string[] = [];
  if (affectedNow !== null) {
    if (affectedNow === 0) verdict = 'fixed';
    else if (before !== null && affectedNow < before) verdict = 'improved';
    else if (before !== null && affectedNow > before) verdict = 'worse';
    else verdict = 'no_change';
    notes.push(affectedNow === 0 ? 'The latest audit no longer finds this issue.' : `Still affects ${affectedNow}${before !== null ? ` (was ${before})` : ''}.`);
  } else if (a.source.kind === 'audit') {
    notes.push('No audit has run since the fix yet.');
  }
  if (lift !== null) {
    notes.push(`Clicks on these pages ${targetChange! >= 0 ? '+' : ''}${targetChange}% vs the rest of the site ${controlChange! >= 0 ? '+' : ''}${controlChange}%.`);
    if (verdict === 'waiting' || verdict === 'no_change') verdict = lift >= 10 ? 'improved' : lift <= -10 ? 'worse' : verdict === 'waiting' ? 'no_change' : verdict;
  }
  return { checkedAt: now.toISOString(), auditId: freshAudit?.auditId ?? null, affectedNow, targetChange, controlChange, verdict, note: notes.join(' ') || 'Nothing to compare yet.' };
}

/** 12.3 / summary numbers. */
export function actionSummary(ws: ActionWorkspace) {
  const live = ws.actions.filter((a) => a.status !== 'dismissed');
  return {
    open: live.filter((a) => a.status === 'todo' || a.status === 'in_progress').length,
    done: live.filter((a) => a.status === 'done' || a.status === 'verified').length,
    verified: live.filter((a) => a.status === 'verified').length,
    waitingApproval: live.filter((a) => needsApproval(a)).length,
    byBucket: Object.fromEntries(ACTION_BUCKETS.map((b) => [b, live.filter((a) => a.bucket === b).length])) as Record<Bucket, number>,
  };
}

export const openActions = (ws: ActionWorkspace) =>
  ws.actions.filter((a) => a.status === 'todo' || a.status === 'in_progress').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

/** CSV export of the plan. */
export function actionsToCsv(ws: ActionWorkspace): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['priority', 'title', 'severity', 'impact', 'confidence', 'effort', 'bucket', 'due', 'owner', 'approval', 'approved', 'status', 'pages', 'detail', 'source', 'latest_check'];
  const rows = ws.actions.map((a) => {
    const last = [...a.checkpoints].reverse().find((c) => c.result);
    return [
      a.priority, a.title, a.severity, a.impact, a.confidence, a.effort, a.bucket, a.dueDate, a.owner, a.approval, a.approvedAt ? 'yes' : a.approval === 'none' ? '' : 'no', a.status,
      a.urls.join(' '), a.detail, actionKey(a.source), last?.result ? `day ${last.day}: ${last.result.verdict}` : '',
    ];
  });
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

const dueCheck = (a: ActionItem, now: Date) => a.status === 'done' && Boolean(a.doneAt) && a.checkpoints.some((c) => !c.result && Date.parse(c.dueAt) <= now.getTime());
/** True when a finished action has a 7/14/28-day checkpoint waiting to be judged. */
export const hasDueChecks = (ws: ActionWorkspace, now = new Date()) => ws.actions.some((a) => dueCheck(a, now));

/**
 * 12.6 Judges every due checkpoint with `judge` (the caller brings the latest audit and Search
 * Console clicks). A 28-day result of fixed or improved marks the action verified.
 */
export async function runChecks(
  ws: ActionWorkspace,
  judge: (a: ActionItem, c: Checkpoint) => Promise<CheckpointResult>,
  now = new Date(),
): Promise<{ ws: ActionWorkspace; checked: number; verified: number }> {
  let checked = 0;
  let verified = 0;
  const actions: ActionItem[] = [];
  for (const a of ws.actions) {
    if (!dueCheck(a, now)) {
      actions.push(a);
      continue;
    }
    let status = a.status;
    const checkpoints: Checkpoint[] = [];
    for (const c of a.checkpoints) {
      if (c.result || Date.parse(c.dueAt) > now.getTime()) {
        checkpoints.push(c);
        continue;
      }
      const result = await judge(a, c);
      checkpoints.push({ ...c, result });
      checked++;
      if (c.day === 28 && (result.verdict === 'fixed' || result.verdict === 'improved')) {
        status = 'verified';
        verified++;
      }
    }
    actions.push({ ...a, checkpoints, status, updatedAt: now.toISOString() });
  }
  return { ws: checked ? { ...ws, actions, updatedAt: now.toISOString() } : ws, checked, verified };
}
