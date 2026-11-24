import { dedupeKey } from '../keywords/clean';
import type { AiPlan, AiPlanTask, TaskCategory } from './ai-plan';
import type { AuditArea, OffpageItem, PlanPageFix, PlanIssue } from './plan-pipeline';
import { fixProblems } from './plan-pipeline';
import type { TopUpCandidate } from './plan-topup';

/**
 * Step 7 of the strategist prompt, in code: repairs what can be repaired (every issue scheduled, Critical
 * and High in months 1–3, off-page and per-area minimums from the analysis's own findings, dependencies
 * pointing back) and then prints PASS/FAIL for every check, like validate.py would.
 */
export type ValidationLine = { check: string; pass: boolean; detail: string };
type MonthTask = AiPlanTask & { month: number };

export const MIN_TASKS = 12;
/** A plan writer that has reported no progress for this long has stopped (server restart). */
export const PLAN_STALL_MS = 35 * 60_000;
export const planStillWriting = (s: { state: string; startedAt: string; updatedAt?: string } | null | undefined, now = Date.now()) =>
  s?.state === 'writing' && now - Date.parse(s.updatedAt ?? s.startedAt) < PLAN_STALL_MS;
export const MAX_RECURRING_COUNTED = 3;
/** The prompt's per-month minimums; AI visibility counts as content, tracking as technical. */
const MINIMUMS: { key: 'technical' | 'on_page' | 'content' | 'off_page' | 'local'; label: string; min: number; of: TaskCategory[] }[] = [
  { key: 'technical', label: 'technical', min: 2, of: ['technical', 'tracking'] },
  { key: 'on_page', label: 'on-page', min: 3, of: ['on_page'] },
  { key: 'content', label: 'content', min: 2, of: ['content', 'ai_visibility'] },
  { key: 'off_page', label: 'off-page', min: 2, of: ['off_page'] },
  { key: 'local', label: 'local', min: 1, of: ['local'] },
];
const AREA_CATEGORY: Record<AuditArea, TaskCategory> = {
  A: 'technical', B: 'technical', I: 'technical', J: 'technical', Q: 'tracking',
  C: 'on_page', D: 'on_page', E: 'on_page', F: 'on_page', H: 'on_page', K: 'on_page',
  G: 'content', L: 'content', O: 'content', P: 'ai_visibility', M: 'off_page', N: 'local',
};
export const categoryOfArea = (a: string): TaskCategory => AREA_CATEGORY[a as AuditArea] ?? 'technical';
const priorityOf = (i: number, c: number, e: number) => Math.round(((i * c) / Math.max(1, e)) * 10) / 10;
const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(Number.isFinite(n) ? n : 3)));
const counted = (tasks: AiPlanTask[]) => tasks.filter((t) => !t.recurring).length + Math.min(MAX_RECURRING_COUNTED, tasks.filter((t) => t.recurring).length);
const inCat = (t: AiPlanTask, of: TaskCategory[]) => of.includes(t.category);
const blank = (o: Partial<AiPlanTask> & Pick<AiPlanTask, 'title' | 'why' | 'change' | 'category'>): AiPlanTask => ({
  id: 'x', week: 2, urls: [], keywords: [], doer: 'team', impact: 3, confidence: 3, effort: 2, priority: 0, depends_on: [], success_check: 'Checked at the next audit.',
  check_after_days: 28, site_wide_item: 'none', page_group: 'none', area: '', issue_ids: [], recurring: false, ...o,
});

export function issueTask(i: PlanIssue): AiPlanTask {
  const impact = clamp5(i.impact), confidence = clamp5(i.confidence), effort = clamp5(i.effort);
  return blank({
    title: i.issue.length > 90 ? `${i.issue.slice(0, 87)}…` : i.issue, why: `${i.affected_url_count} URL(s) affected (${i.severity}).`, change: i.fix,
    category: categoryOfArea(i.area), area: i.area, urls: i.example_urls.slice(0, 20), doer: i.doer, impact, confidence, effort, priority: priorityOf(impact, confidence, effort),
    issue_ids: [i.issue_id], success_check: 'The next audit shows this issue fixed.', check_after_days: 14,
  });
}
const offpageTask = (o: OffpageItem): AiPlanTask =>
  blank({ title: o.title, why: `Off-page programme: ${o.monthly_number}.`, change: `${o.method}${o.targets.length ? ` Targets: ${o.targets.join(', ')}.` : ''}`, category: 'off_page', area: 'M', impact: 3, confidence: 3, effort: 3, priority: 3, week: 3, success_check: `${o.monthly_number} done this month.` });
const fixTask = (r: PlanPageFix): AiPlanTask =>
  blank({ title: `On-page fixes for ${pathOf(r.url)}`, why: `Page fix sheet: ${r.other_fixes.length} fix(es) beyond titles and headings.`, change: r.other_fixes.join(' '), category: 'on_page', area: 'H', urls: [r.url], keywords: r.main_keyword ? [r.main_keyword] : [], impact: r.priority === 'High' ? 4 : 3, confidence: 4, effort: 2, priority: r.priority === 'High' ? 8 : 6 });
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export type RepairContext = { issues: PlanIssue[]; offpage: OffpageItem[]; pageFixes: PlanPageFix[]; minTasks: number; local: boolean; /** Findings from the content audit, AI search and the audit (plan-topup.ts). */ extra?: TopUpCandidate[] };

/** Repairs the month lists in place before ids are renumbered; returns notes on what changed. */
export function repairMonths(all: MonthTask[], later: AiPlan['later'], ctx: RepairContext): string[] {
  const notes: string[] = [];
  const min = Math.max(MIN_TASKS, ctx.minTasks);
  const month = (m: number) => all.filter((t) => t.month === m);
  const leastBusy = (from: number, to: number) => [...Array(to - from + 1).keys()].map((i) => i + from).sort((a, b) => counted(month(a)) - counted(month(b)))[0]!;

  // Every Critical and High issue lands in months 1–3.
  const scheduled = new Set(all.flatMap((t) => t.issue_ids));
  for (const i of ctx.issues.filter((x) => x.severity === 'Critical' || x.severity === 'High')) {
    for (const t of all.filter((x) => x.issue_ids.includes(i.issue_id) && x.month > 3)) {
      notes.push(`Moved "${t.title}" to month 3: it fixes a ${i.severity.toLowerCase()} issue (${i.issue_id}).`);
      t.month = 3;
    }
  }
  // Every issue gets a task (or stays in "later" when the model put it there with a reason).
  const deferred = later.map((l) => l.title.toLowerCase());
  let added = 0;
  for (const i of ctx.issues) {
    if (scheduled.has(i.issue_id) || deferred.some((d) => d.includes(i.issue_id.toLowerCase()))) continue;
    const m = i.severity === 'Critical' ? 1 : i.severity === 'High' ? leastBusy(1, 3) : leastBusy(2, 6);
    all.push({ ...issueTask(i), month: m });
    scheduled.add(i.issue_id);
    added++;
  }
  if (added) notes.push(`Added ${added} task(s) for issues in the register that the plan had not scheduled.`);

  // Per-area minimums and the monthly total, from the analysis's own findings.
  const usedOffpage = new Set(all.filter((t) => t.category === 'off_page').map((t) => t.title.toLowerCase()));
  const offpagePool = ctx.offpage.filter((o) => !usedOffpage.has(o.title.toLowerCase()));
  const fixPool = ctx.pageFixes.filter((r) => r.other_fixes.length && !all.some((t) => t.urls.includes(r.url) && t.category === 'on_page' && t.site_wide_item === 'none')).sort((a, b) => Number(b.priority === 'High') - Number(a.priority === 'High'));
  const keyOf = (t: AiPlanTask) => (t.urls.length ? t.urls.map((u) => `${t.category}|${u.toLowerCase()}`) : [`${t.category}|${t.title.toLowerCase()}`]);
  const used = new Set(all.flatMap(keyOf));
  const extra = (ctx.extra ?? [])
    .filter((c) => !keyOf(c.task).some((k) => used.has(k)))
    .sort((a, b) => priorityOf(b.task.impact, b.task.confidence, b.task.effort) - priorityOf(a.task.impact, a.task.confidence, a.task.effort));
  const pull = (m: number, of: TaskCategory[]): AiPlanTask | null => {
    const e = extra.findIndex((c) => c.earliest <= m && of.includes(c.task.category) && !keyOf(c.task).some((k) => used.has(k)));
    if (e >= 0) {
      const t = extra.splice(e, 1)[0]!.task;
      for (const k of keyOf(t)) used.add(k);
      return t;
    }
    if (of.includes('off_page')) {
      // Each month takes its own programme items, so no month is emptied to fill another.
      const i = offpagePool.findIndex((o) => Math.round(o.month) === m);
      if (i >= 0) return offpageTask(offpagePool.splice(i, 1)[0]!);
    }
    if (of.includes('on_page') && fixPool.length) return fixTask(fixPool.shift()!);
    return null;
  };
  let topped = 0;
  for (let m = 1; m <= 6; m++) {
    for (const rule of MINIMUMS) {
      if (rule.key === 'local' && !ctx.local) continue;
      while (month(m).filter((t) => inCat(t, rule.of)).length < rule.min) {
        const t = pull(m, rule.of);
        if (!t) break;
        all.push({ ...t, month: m });
        topped++;
      }
    }
    while (counted(month(m)) < min) {
      const t = pull(m, ['content', 'ai_visibility', 'technical', 'tracking', 'local']) ?? pull(m, ['on_page']) ?? pull(m, ['off_page']);
      if (!t) break;
      all.push({ ...t, month: m });
      topped++;
    }
  }
  if (topped) notes.push(`Added ${topped} task(s) from the audit findings, the off-page programme and the page fix sheet to meet the monthly minimums.`);
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

export function validatePlan(plan: AiPlan, ctx: { issues: PlanIssue[]; pageFixes: PlanPageFix[]; indexableUrls: string[]; minTasks: number; local: boolean; banned: string[] }): ValidationLine[] {
  const lines: ValidationLine[] = [];
  const add = (check: string, pass: boolean, detail: string) => lines.push({ check, pass, detail });
  const min = Math.max(MIN_TASKS, ctx.minTasks);
  const tasks = plan.months.flatMap((m) => m.tasks.map((t) => ({ ...t, month: m.month })));

  const present = [1, 2, 3, 4, 5, 6].filter((m) => plan.months.some((x) => x.month === m));
  add('plan.json has months 1–6', present.length === 6, `months present: ${present.join(', ')}`);

  for (const m of plan.months) {
    const counts = Object.fromEntries(MINIMUMS.map((r) => [r.key, m.tasks.filter((t) => inCat(t, r.of)).length]));
    const short = MINIMUMS.filter((r) => (r.key !== 'local' || ctx.local) && counts[r.key]! < r.min).map((r) => `${r.label} ${counts[r.key]}/${r.min}`);
    const total = counted(m.tasks);
    const recurring = m.tasks.filter((t) => t.recurring).length;
    add(`Month ${m.month}: ≥ ${min} tasks, ≥ 2 off-page, ≥ 2 technical, ≥ 3 on-page, ≥ 2 content${ctx.local ? ', ≥ 1 local' : ''}, ≤ ${MAX_RECURRING_COUNTED} recurring counted`,
      total >= min && !short.length,
      `${total} counted (${m.tasks.length} tasks, ${recurring} recurring); ${MINIMUMS.filter((r) => r.key !== 'local' || ctx.local).map((r) => `${r.label} ${counts[r.key]}`).join(', ')}${short.length ? `; short: ${short.join(', ')}` : ''}`);
  }

  const scheduled = new Set(tasks.flatMap((t) => t.issue_ids));
  const laterText = plan.later.map((l) => `${l.title} ${l.reason_deferred}`.toLowerCase());
  const missing = ctx.issues.filter((i) => !scheduled.has(i.issue_id) && !laterText.some((l) => l.includes(i.issue_id.toLowerCase())));
  add('Every issue_id appears in a task or in "later" with a reason', !missing.length, missing.length ? `missing: ${missing.map((i) => i.issue_id).join(', ')}` : `${ctx.issues.length} issues covered`);

  const urgent = ctx.issues.filter((i) => i.severity === 'Critical' || i.severity === 'High');
  const lateUrgent = urgent.filter((i) => !tasks.some((t) => t.issue_ids.includes(i.issue_id) && t.month <= 3));
  add('Every Critical and High issue is scheduled in Months 1–3', !lateUrgent.length, lateUrgent.length ? `not in months 1–3: ${lateUrgent.map((i) => i.issue_id).join(', ')}` : `${urgent.length} Critical/High issues in months 1–3`);

  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const inSheet = new Set(ctx.pageFixes.map((r) => norm(r.url)));
  const notInSheet = ctx.indexableUrls.filter((u) => !inSheet.has(norm(u)));
  add('Every indexable URL in the crawl appears in page_fixes.csv', !notInSheet.length, notInSheet.length ? `missing ${notInSheet.length}: ${notInSheet.slice(0, 5).join(', ')}` : `${ctx.indexableUrls.length} URLs`);

  const items = { meta_title: 'meta titles', meta_description: 'meta descriptions', h1: 'H1/headings', canonical: 'canonical tags', alt_text: 'image alt text' } as const;
  const missingItems = (Object.keys(items) as (keyof typeof items)[]).filter((k) => !tasks.some((t) => t.site_wide_item === k));
  add('Separate tasks exist for meta titles, meta descriptions, H1/headings, canonical tags, image alt text', !missingItems.length, missingItems.length ? `missing: ${missingItems.map((k) => items[k]).join(', ')}` : 'all five present');

  const problems = fixProblems(ctx.pageFixes);
  add('No duplicate new_title or new_meta values; all lengths inside the rules', !problems.size, problems.size ? [...problems].slice(0, 5).map(([u, p]) => `${u}: ${p.join('; ')}`).join(' | ') : `${ctx.pageFixes.length} rows checked`);

  const owner = new Map<string, string>();
  const twice: string[] = [];
  for (const p of plan.page_map) {
    const k = dedupeKey(p.main_keyword);
    if (!k) continue;
    if (owner.has(k) && owner.get(k) !== p.url) twice.push(p.main_keyword);
    else owner.set(k, p.url);
  }
  add('No keyword is the main keyword of two URLs', !twice.length, twice.length ? twice.join(', ') : `${plan.page_map.length} pages mapped`);

  const order = new Map(tasks.map((t, i) => [t.id, i]));
  const badDeps = tasks.filter((t) => t.depends_on.some((d) => (order.get(d) ?? Infinity) >= order.get(t.id)!));
  const badWeeks = tasks.filter((t) => t.week < 1 || t.week > 4);
  add('All depends_on ids are earlier tasks; all dates inside their month', !badDeps.length && !badWeeks.length, badDeps.length || badWeeks.length ? `dependencies: ${badDeps.map((t) => t.id).join(', ') || 'ok'}; weeks: ${badWeeks.map((t) => t.id).join(', ') || 'ok'}` : `${tasks.length} tasks`);

  const words = ctx.banned.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const text = (s: string) => words.filter((w) => s.toLowerCase().includes(w));
  const hits = words.length
    ? [...tasks.flatMap((t) => text(`${t.title} ${t.why} ${t.change}`)), ...ctx.pageFixes.flatMap((r) => text(`${r.new_title} ${r.new_meta} ${r.new_h1}`))]
    : [];
  add('No banned words in any task or fix', !hits.length, words.length ? (hits.length ? `found: ${[...new Set(hits)].join(', ')}` : `${words.length} banned words checked`) : 'no banned words given');
  return lines;
}

export const validationText = (lines: ValidationLine[]) =>
  [...lines.map((l) => `${l.pass ? 'PASS' : 'FAIL'}  ${l.check}\n      ${l.detail}`), '', `${lines.filter((l) => l.pass).length} of ${lines.length} checks pass.`].join('\n');
