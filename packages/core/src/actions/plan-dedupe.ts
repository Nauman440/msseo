import type { AiPlanTask } from './ai-plan';

/**
 * Bug fixes 2026-11-25 (duplicate tasks and impossible order). Run on the month lists before ids are renumbered:
 *  - one AI-visibility check per month ("AI-visibility re-test" and "Run the 3rd AI visibility check" were both kept);
 *  - tasks doing the same work (overlapping issue ids, or the same kind of work on the same pages) are merged
 *    into the earliest one (security settings in months 2 and 3, mobile speed in 1–3, FAQs in 2 and 6…);
 *  - a task that checks articles or new pages comes after the task that creates them, else it is dropped;
 *  - no "final" wording before month 6;
 *  - breadcrumbs: only BreadcrumbList markup can be added without theme code, so tasks say "breadcrumb markup".
 */
type MonthTask = AiPlanTask & { month: number };
const text = (t: AiPlanTask) => `${t.title} ${t.change}`;

/** The recurring check of how the business shows in AI answers. */
export const AI_CHECK = /\b(ai[- ]visibility|ai search|share[- ]of[- ]voice)\s+(re-?test|check|baseline|test|audit)\b|\b(re-?test|baseline)\b.*\b(ai|chatgpt|share of voice)\b/i;
export const isAiCheck = (t: AiPlanTask) => t.category === 'ai_visibility' && AI_CHECK.test(t.title);

/** Kinds of work that should appear once (per set of pages), whatever words the model used. */
const FAMILIES: [string, RegExp][] = [
  ['security', /\bsecurity (headers?|settings)\b|\bhsts\b|\bcontent[- ]security[- ]policy\b|\bx-frame-options\b/i],
  ['speed', /\b(page|site|mobile|load(ing)?) speed\b|\bcore web vitals\b|\bpagespeed\b|\blcp\b|\bload(ing)? times?\b|\bspeed up\b/i],
  ['direct-answer', /\bdirect answers?\b|\banswer[- ]first\b/i],
  ['faq', /\bfaqs?\b|\bfaqpage\b|\bfrequently asked\b/i],
  ['org-schema', /\borgani[sz]ation (schema|markup|json-ld)\b/i],
  ['comparison', /\bcomparison tables?\b/i],
  ['breadcrumb', /\bbreadcrumb/i],
  ['merchant', /\bmerchant center\b|\bproduct feed\b/i],
  ['brand-block', /\b(factual )?brand block\b/i],
];
export const familyOf = (t: AiPlanTask): string | null => FAMILIES.find(([, re]) => re.test(text(t)))?.[0] ?? null;
const overlap = (a: string[], b: string[]) => {
  const key = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const s = new Set(a.map(key));
  return b.some((u) => s.has(key(u)));
};

/** Two tasks that do the same work: overlapping issue ids, or the same family on the same pages (or both site-wide). */
export function sameWork(a: AiPlanTask, b: AiPlanTask): boolean {
  if (a.recurring || b.recurring || a.site_wide_item !== 'none' || b.site_wide_item !== 'none') return false;
  if (a.issue_ids.length && b.issue_ids.some((i) => a.issue_ids.includes(i))) return true;
  const f = familyOf(a);
  return Boolean(f) && f === familyOf(b) && ((!a.urls.length && !b.urls.length) || overlap(a.urls, b.urls));
}

const before = (a: MonthTask, b: MonthTask) => a.month - b.month || a.week - b.week;
const union = (a: string[], b: string[], max: number) => [...new Set([...a, ...b])].slice(0, max);

/** Merges duplicates into the earliest task (in place). Returns old id → kept id, for dependencies. */
export function dedupeTasks(all: MonthTask[], notes: string[]): Map<string, string> {
  const renamed = new Map<string, string>();
  const drop = (t: MonthTask, into: MonthTask) => {
    renamed.set(t.id, into.id);
    all.splice(all.indexOf(t), 1);
  };
  // One AI-visibility check per month.
  let aiDupes = 0;
  for (let m = 1; m <= 6; m++) {
    const checks = all.filter((t) => t.month === m && isAiCheck(t)).sort(before);
    for (const extra of checks.slice(1)) {
      drop(extra, checks[0]!);
      aiDupes++;
    }
  }
  if (aiDupes) notes.push(`Merged ${aiDupes} extra AI-visibility check(s): one check a month.`);
  // Same work twice: keep the earliest, with the pages, keywords and issues of both.
  let merged = 0;
  const ordered = [...all].sort(before);
  for (let i = 0; i < ordered.length; i++) {
    const keep = ordered[i]!;
    if (!all.includes(keep)) continue;
    for (const t of ordered.slice(i + 1)) {
      if (!all.includes(t) || !sameWork(keep, t)) continue;
      keep.urls = union(keep.urls, t.urls, 50);
      keep.keywords = union(keep.keywords, t.keywords, 10);
      keep.issue_ids = union(keep.issue_ids, t.issue_ids, 20);
      keep.impact = Math.max(keep.impact, t.impact);
      drop(t, keep);
      merged++;
    }
  }
  if (merged) notes.push(`Merged ${merged} task(s) that repeated work planned earlier (same issue, or the same work on the same pages).`);
  for (const t of all) t.depends_on = [...new Set(t.depends_on.map((d) => renamed.get(d) ?? d))].filter((d) => d !== t.id);
  return renamed;
}

const CREATES = /\b(write|publish|create|launch|build|draft|add)\b/i;
const CHECKS = /\b(check|verify|monitor|measure|track|confirm|review|test|index(ed|ing)?|discovery)\b/i;
const KIND: [string, RegExp][] = [
  ['article', /\b(articles?|blog posts?|blog|guides?)\b/i],
  ['page', /\bnew (\w+ )?(pages?|landing pages?)\b/i],
];
const kindOf = (t: AiPlanTask) => KIND.find(([, re]) => re.test(text(t)))?.[0] ?? null;
/** Checks of things the plan creates ("the first articles", "new pages"), not of what the site already has. */
const OF_NEW = /\b(new|first|published|launched)\b/i;

/** A task that checks articles or new pages must come after the task that creates them (in place). */
export function orderChecks(all: MonthTask[], notes: string[]): void {
  const creators = all.filter((t) => kindOf(t) && CREATES.test(t.title) && !CHECKS.test(t.title.replace(CREATES, ''))).sort(before);
  let moved = 0;
  let dropped = 0;
  for (const t of [...all]) {
    const kind = kindOf(t);
    if (!kind || !CHECKS.test(t.title) || CREATES.test(t.title) || !OF_NEW.test(t.title) || t.recurring) continue;
    const first = creators.find((c) => kindOf(c) === kind);
    if (!first) {
      all.splice(all.indexOf(t), 1);
      dropped++;
      continue;
    }
    if (before(t, first as MonthTask) > 0) continue;
    let month = first.month;
    let week = first.week + 1;
    if (week > 4) {
      month++;
      week = 1;
    }
    if (month > 6) {
      all.splice(all.indexOf(t), 1);
      dropped++;
      continue;
    }
    t.month = month;
    t.week = week;
    if (!t.depends_on.includes(first.id)) t.depends_on.push(first.id);
    moved++;
  }
  if (moved) notes.push(`Moved ${moved} check(s) after the task that creates what they check.`);
  if (dropped) notes.push(`Dropped ${dropped} check(s) of articles or pages the plan does not create in time.`);
}

/** No "final" before month 6; "breadcrumb markup" instead of visible breadcrumbs (in place). */
export function fixWording(all: MonthTask[]): void {
  const tidy = (s: string) => {
    const out = s.replace(/\s{2,}/g, ' ').trim();
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  const crumbs = (s: string) => s
    .replace(/\bvisible breadcrumbs?( (navigation|trail|links?|menus?))?\b/gi, 'breadcrumb markup')
    .replace(/\bbreadcrumbs?( (navigation|trail|links?|menus?))?\b(?!\s*(markup|schema|json))/gi, 'breadcrumb markup');
  for (const t of all) {
    for (const k of ['title', 'why', 'change', 'success_check'] as const) {
      let v = crumbs(t[k]);
      if (t.month < 6) v = v.replace(/\b(validate|confirm|check|run|do)?\s*(the )?final\b\s*/gi, (m, verb: string | undefined) => (verb ? `${verb} ` : ''));
      t[k] = tidy(v);
    }
  }
}

/** All three, in order. */
export function tidyPlanTasks(all: MonthTask[], notes: string[]): void {
  fixWording(all);
  dedupeTasks(all, notes);
  orderChecks(all, notes);
}
