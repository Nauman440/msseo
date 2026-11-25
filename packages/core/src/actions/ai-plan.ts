import { z } from 'zod';
import { dedupeKey, normTerm } from '../keywords/clean';
import type { KeywordWorkspace } from '../keywords/types';
import type { MappingWorkspace } from '../mapping/mapping';
import type { OpenAiClient } from '../providers/openai';
import { assertSameSite, siteQuestions } from './plan-guard';
import { settlePageMeta, type MetaPage, type MetaReview } from './plan-meta';
import { tidyPlanTasks } from './plan-dedupe';
import { aiVisibilityBlock, askForPlan, auditIssues, businessBlock, isKeep, keywordsBlock, normPlanUrl, offpageBlock, pagesBlock, planPrompt, platformOf, siteCheck, softwareCan, titleSuffix, toAiPlan, type NeedsDeveloper, type PlanIssue, type PlanPlatform } from './plan-prompt';
import { BLOCKER_TASK, fixDependencies, MIN_TASKS, repairPlan, validatePlan, type RepairContext, type ValidationLine } from './plan-validate';
import type { ReportModel } from '../types';
import type { AeoAudit, AeoWorkspace } from '../aeo/aeo';
import type { ContentAudit } from '../content/content';
import { topUpCandidates, type TopUpCandidate } from './plan-topup';
import { namePlanActions } from './plan-names';
import { pageCards } from '../mapping/page-cards';
import { AFTER_CANONICAL, CLEANUP_DOER, CLEANUP_ITEMS, cleanupPages, cleanupTask, NEEDS_APPROVAL, PAGE_GROUPS, SITE_WIDE_ITEMS, weeklyCheckTask, type CleanupItem, type CleanupPage, type PageGroup } from './cleanup';
import { ACTION_BUCKETS, beforeState, type ActionItem, type ActionWorkspace, type Suggestion } from './actions';

/**
 * Module 12 · the 6-month action plan written by AI (OpenAI, strict JSON), from everything the tool
 * knows about one website. The model is asked to follow the plan rules; `checkPlan()` then enforces the
 * ones that can be checked in code (one page per keyword, checks that fit the business type, blockers in
 * month 1, monthly capacity, scores), so a wrong answer never reaches the plan unchecked.
 */
export type BusinessKind = 'ecommerce' | 'local_service' | 'local_shop' | 'b2b' | 'mixed';
export type PlanTier = 'autopilot' | 'growth';
/**
 * Work per month: the most changes software applies after approval, new pages and new articles, and the
 * fewest tasks a month should hold (`minTasks`; plans written before 2026-11-24 have none).
 */
export type PlanCapacity = { automatic: number; newPages: number; articles: number; minTasks: number; /** The SEO team does outreach (else the client, with templates). */ outreach?: boolean };
export const PLAN_CAPACITY: Record<PlanTier, PlanCapacity> = {
  autopilot: { automatic: 15, newPages: 2, articles: 1, minTasks: 15, outreach: false },
  growth: { automatic: 40, newPages: 4, articles: 4, minTasks: 20, outreach: true },
};

/** Monthly capacity from the admin settings (`plan.<tier>.*`), else the defaults above. */
export function capacityFor(settings: Partial<Record<string, unknown>>, tier: PlanTier): PlanCapacity {
  const n = (k: 'automatic' | 'newPages' | 'articles' | 'minTasks') => {
    const v = Number(settings[`plan.${tier}.${k}`]);
    return Number.isFinite(v) && v >= 0 ? v : PLAN_CAPACITY[tier][k];
  };
  const o = settings[`plan.${tier}.outreach`];
  return { automatic: n('automatic'), newPages: n('newPages'), articles: n('articles'), minTasks: n('minTasks'), outreach: typeof o === 'boolean' ? o : PLAN_CAPACITY[tier].outreach };
}

export { TASK_CATEGORIES, TASK_DOERS } from './plan-constants';
import { TASK_CATEGORIES, TASK_DOERS } from './plan-constants';
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskDoer = (typeof TASK_DOERS)[number];

const task = z.object({
  id: z.string(),
  week: z.number(),
  title: z.string(),
  why: z.string(),
  urls: z.array(z.string()),
  keywords: z.array(z.string()),
  change: z.string(),
  category: z.enum(TASK_CATEGORIES),
  doer: z.enum(TASK_DOERS),
  impact: z.number(),
  confidence: z.number(),
  effort: z.number(),
  priority: z.number(),
  depends_on: z.array(z.string()),
  success_check: z.string(),
  check_after_days: z.number(),
  /** Rules 20–23: which site-wide clean-up this task is ('none' for every other task). */
  site_wide_item: z.enum(SITE_WIDE_ITEMS),
  page_group: z.enum(PAGE_GROUPS),
  /** Audit area A–Q from the checklist ('' when none). */
  area: z.string(),
  /** Issue register ids this task fixes. */
  issue_ids: z.array(z.string()),
  /** A task that repeats every week or month (at most 3 count toward a month's minimum). */
  recurring: z.boolean(),
});
export const aiPlanSchema = z.object({
  summary: z.string(),
  baseline_and_targets: z.array(z.object({ metric: z.string(), now: z.string(), month_3_target: z.string(), month_6_target: z.string() })),
  removed_keywords: z.array(z.object({ keyword: z.string(), reason: z.string() })),
  page_map: z.array(z.object({ url: z.string(), is_new: z.boolean(), page_type: z.string(), main_keyword: z.string(), supporting_keywords: z.array(z.string()), total_monthly_volume: z.number() })),
  months: z.array(z.object({ month: z.number(), theme: z.string(), goal: z.string(), tasks: z.array(task) })),
  later: z.array(z.object({ title: z.string(), reason_deferred: z.string() })),
  data_gaps: z.array(z.string()),
});
export type AiPlan = z.infer<typeof aiPlanSchema>;
export type AiPlanTask = z.infer<typeof task>;

// JSON Schema for OpenAI strict mode: every property required, no extra properties.
const str = { type: 'string' };
const num = { type: 'number' };
const strs = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const AI_PLAN_JSON_SCHEMA = obj({
  summary: str,
  baseline_and_targets: { type: 'array', items: obj({ metric: str, now: str, month_3_target: str, month_6_target: str }) },
  removed_keywords: { type: 'array', items: obj({ keyword: str, reason: str }) },
  page_map: { type: 'array', items: obj({ url: str, is_new: { type: 'boolean' }, page_type: str, main_keyword: str, supporting_keywords: strs, total_monthly_volume: num }) },
  months: {
    type: 'array',
    items: obj({
      month: num, theme: str, goal: str,
      tasks: {
        type: 'array',
        items: obj({
          id: str, week: num, title: str, why: str, urls: strs, keywords: strs, change: str,
          category: { type: 'string', enum: [...TASK_CATEGORIES] }, doer: { type: 'string', enum: [...TASK_DOERS] },
          impact: num, confidence: num, effort: num, priority: num, depends_on: strs, success_check: str, check_after_days: num,
          site_wide_item: { type: 'string', enum: [...SITE_WIDE_ITEMS] }, page_group: { type: 'string', enum: [...PAGE_GROUPS] },
          area: str, issue_ids: strs, recurring: { type: 'boolean' },
        }),
      },
    }),
  },
  later: { type: 'array', items: obj({ title: str, reason_deferred: str }) },
  data_gaps: strs,
});

// ---- Input --------------------------------------------------------------------------------

export type PlanBusiness = {
  domain: string;
  businessType: BusinessKind;
  sells: string[];
  brands: string[];
  where: string;
  priorities: string[];
  seasonalPeaks: string[];
  tier: PlanTier;
  capacity: PlanCapacity;
  startDate: string;
  outreachByTeam?: boolean;
  /** The shortlisted competitors (Module 3). */
  competitors?: string[];
  /** Not known yet: there is no field for them, so the prompt says "no data". */
  notOffered?: string[];
  bannedWords?: string[];
};
export type PlanExtras = {
  gsc?: { query: string; page?: string; clicks: number; impressions: number; position: number }[] | null;
  backlinks?: { referringDomains: number | null; competitors: { domain: string; referringDomains: number | null }[]; gap: string[]; /** Backlinks pointing to pages that no longer work. */ broken?: number } | null;
  local?: { name: string | null; rating: number | null; reviews: number | null; category: string | null; claimed: boolean | null } | null;
  /** Module 10: how the business shows in AI answers, trimmed for the plan. */
  aiSearch?: PlanAiSearch | null;
  /** Module 7: pages to improve, merge or refresh. */
  content?: PlanContent | null;
  /** Module 3: the competitors we watch. */
  competitors?: string[] | null;
};
export type PlanAiSearch = {
  checked_at: string;
  your_share_of_voice: number | null;
  competitors_named_instead: { domain: string; share: number }[];
  questions_where_you_are_not_named: string[];
  blocked_crawlers: string[];
  missing_entity_signals: string[];
  answer_ready_problems: string[];
  wrong_facts: string[];
  cited_sources: string[];
  snippet_controls: string[];
  missing_third_party: string[];
  /** Each question as each assistant answered it (for <ai_visibility>). */
  answers?: { question: string; assistant: string; mentioned: boolean; cited: string[] }[];
};
export type PlanContentRow = { url: string; verdict: string; reason: string; clicks: number | null; position: number | null };
export type PlanContent = { pages: PlanContentRow[]; decay: { url: string; change: number | null; clicks: number | null }[]; topic_gaps: string[]; weak_quality: { url: string; note: string }[] };
export type PlanInput = { business: PlanBusiness; data: Record<string, unknown> };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Ecommerce for shops; a local service when places are served; otherwise mixed. */
export const businessKindOf = (ws: Pick<KeywordWorkspace, 'businessType' | 'seeds'>): BusinessKind =>
  ws.businessType === 'shop' ? 'ecommerce' : ws.seeds.locations.length ? 'local_service' : 'mixed';

/** Everything the model needs, trimmed so the request stays small (lists are capped, best first). */
export function buildPlanInput(args: {
  domain: string;
  tier: PlanTier;
  capacity?: PlanCapacity;
  keywords: KeywordWorkspace;
  mapping: MappingWorkspace | null;
  report: ReportModel | null;
  country?: string | null;
  priorities?: string[];
  start: Date;
  extras?: PlanExtras;
  /** The site connection (§16.5), when there is one. */
  connected?: 'shopify' | 'wordpress' | null;
  /** Saved results the extras were built from, with the website each belongs to (checked by `assertSameSite`). */
  sources?: { label: string; domain: string | null | undefined }[];
}): PlanInput {
  const kw = args.keywords;
  const kind = businessKindOf(kw);
  const places = kw.seeds.locations;
  const seasonal = kw.clusters
    .filter((c) => c.seasonalPeak)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map((c) => `${c.name}: peaks in ${MONTHS[c.seasonalPeak! - 1]}`);
  const kept = kw.keywords.filter((k) => k.status === 'kept').sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 150);
  const gap = new Map<string, string[]>();
  for (const k of kept) for (const d of k.gapFrom ?? []) gap.set(d, [...(gap.get(d) ?? []), k.term]);
  const allPages = args.report?.pages ?? [];
  const pages = allPages.slice(0, 100);
  // Links into each page from the other checked pages (the crawl keeps each page's outgoing links).
  const key = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const inlinks = new Map<string, number>();
  for (const p of allPages) for (const l of new Set(p.links.map(key))) if (l !== key(p.url)) inlinks.set(l, (inlinks.get(l) ?? 0) + 1);
  const issues = (args.report?.issues ?? [])
    .filter((i) => i.severity !== 'info' && (i.status === 'fail' || i.status === 'warn'))
    .slice(0, 80)
    .map((i) => ({ rule: i.ruleId, issue: i.title.expert, fix: i.fix.expert, severity: i.severity, affected: i.affectedCount ?? i.urls.length, urls: i.urls.slice(0, 5) }));
  const gsc = (args.extras?.gsc ?? []).slice().sort((a, b) => b.impressions - a.impressions).slice(0, 80)
    .map((r) => ({ query: r.query, page: r.page ?? null, clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0, position: Math.round(r.position * 10) / 10 }));
  return {
    business: {
      domain: args.domain,
      businessType: kind,
      sells: kw.seeds.services,
      brands: kind === 'ecommerce' ? (kw.seeds.brands.length ? kw.seeds.brands : ['own brand only']) : kw.seeds.brands,
      where: [args.country ?? kw.country, kind === 'ecommerce' ? 'delivers online' : places.length ? `serves ${places.join(', ')}` : ''].filter(Boolean).join('; '),
      priorities: (args.priorities ?? []).slice(0, 5),
      seasonalPeaks: seasonal,
      tier: args.tier,
      capacity: args.capacity ?? PLAN_CAPACITY[args.tier],
      startDate: args.start.toISOString().slice(0, 10),
      outreachByTeam: (args.capacity ?? PLAN_CAPACITY[args.tier]).outreach ?? args.tier === 'growth',
      competitors: (args.extras?.competitors ?? []).slice(0, 8),
    },
    data: {
      site_wide_pages: cleanupPages(allPages, kind),
      crawl_summary: pages.map((p) => ({ url: p.url, title: p.title, title_length: p.title?.length ?? null, meta_description: p.description ?? null, h1: p.h1, h1_count: p.h1Count ?? null, canonical: p.canonical ?? null, noindex: p.noindex ?? null, words: p.words, inlinks: inlinks.get(key(p.url)) ?? 0, images: p.images ?? null, images_missing_alt: p.imagesNoAlt ?? null, schema: p.schemaTypes, page_type: p.pageType })),
      audit_checks_passed: (args.report?.issues ?? []).filter((i) => i.status === 'pass').map((i) => `${i.ruleId} ${i.title.expert}`).slice(0, 80),
      audit_score: args.report?.overall.score ?? null,
      audit_issues: issues,
      search_console_90_days: args.extras?.gsc ? gsc : 'not connected',
      keyword_research: kept.map((k) => ({ keyword: k.term, volume: k.volume, difficulty: k.difficulty, intent: k.intent, position: k.position, ranking_url: k.url })),
      topics: kw.clusters.slice(0, 40).map((c) => ({ topic: c.name, searches: c.volume, priority: c.priority, page_type: c.pageType, best_position: c.bestPosition })),
      page_plan: (args.mapping?.rows ?? []).slice(0, 40).map((r) => ({ topic: r.topic, page: r.url, action: r.action, main_keyword: r.primaryKeyword, competing_pages: r.conflicts.map((c) => c.url) })),
      competitor_gaps: [...gap].slice(0, 5).map(([domain, terms]) => ({ competitor: domain, keywords_they_rank_for_and_we_do_not: terms.slice(0, 15) })),
      content_audit: args.extras?.content ?? 'not run yet: plan content optimisation from the crawl, positions and page plan',
      ai_search: args.extras?.aiSearch ?? 'not checked yet: plan crawler access, entity signals and answer-ready content from the crawl',
      ai_questions: siteQuestions(kw).questions,
      people_also_ask: (kw.questions ?? []).slice(0, 40).map((q) => ({ question: q.text, keyword: q.keyword })),
      backlinks: args.extras?.backlinks ?? 'not checked',
      business_profile: args.extras?.local ?? (kind === 'ecommerce' ? 'not relevant' : 'not checked'),
    },
  };
}

// ---- Checks the code can enforce -----------------------------------------------------------

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(Number.isFinite(n) ? n : 3)));
const priorityOf = (i: number, c: number, e: number) => Math.round(((i * c) / Math.max(1, e)) * 10) / 10;
const CHECK_DAYS = [7, 14, 28] as const;
const nearestCheck = (d: number) => CHECK_DAYS.reduce((best, x) => (Math.abs(x - d) < Math.abs(best - d) ? x : best), 14);
/** Things only a service business needs (rule 5). */
const SERVICE_ONLY = /\b(licen[cs]es?|licensed|insurance|insured|service[- ]areas?)\b/i;
/** Problems that stop Google crawling, indexing or rendering pages (rule 7). */
const BLOCKER = /\b(noindex|robots\.txt|blocked|not indexed|indexing|sitemap|broken (pages?|links?)|404|5\d\d errors?|server errors?|crawl(ing)? errors?|canonical)\b/i;
const ARTICLE = /\b(article|blog|guide|post)\b/i;
const NEW_PAGE = /\b(create|new|build|add|write)\b/i;

export type CheckedPlan = { plan: AiPlan; notes: string[] };

/**
 * Enforces rules 3, 5, 7, 13, 14–17 and 20–23 on the model's answer, and says what it changed.
 * `pages` (the crawl's site-wide clean-up view) lets it add clean-up tasks the model left out.
 */
export function checkPlan(
  raw: AiPlan,
  business: Pick<PlanBusiness, 'businessType' | 'capacity'>,
  pages: CleanupPage[] = [],
  topUp: TopUpCandidate[] = [],
  /** The plan prompt's issues and developer-only items: RULES 1–6 are repaired from the site's findings. */
  repair?: Pick<RepairContext, 'issues' | 'needsDeveloper' | 'questions'>,
): CheckedPlan {
  const notes: string[] = [];
  const plan: AiPlan = structuredClone(raw);

  // 3. No keyword on two pages: the first page (the model lists the most valuable first) keeps it.
  const owner = new Map<string, string>();
  const claim = (k: string, url: string) => {
    const key = dedupeKey(k);
    if (!key) return false;
    if (owner.has(key) && owner.get(key) !== url) return false;
    owner.set(key, url);
    return true;
  };
  plan.page_map = plan.page_map.filter((p) => {
    if (!claim(p.main_keyword, p.url)) {
      notes.push(`"${p.main_keyword}" was the main keyword of two pages; kept it on ${owner.get(dedupeKey(p.main_keyword))} only.`);
      return false;
    }
    const before = p.supporting_keywords.length;
    const main = dedupeKey(p.main_keyword);
    // A plural or reordered copy of the main keyword is the same search: not a supporting keyword.
    p.supporting_keywords = [...new Set(p.supporting_keywords.map(normTerm))].filter((k) => dedupeKey(k) !== main && claim(k, p.url));
    if (p.supporting_keywords.length < before) notes.push(`Removed ${before - p.supporting_keywords.length} keyword(s) from ${p.url} that belong to another page.`);
    return true;
  });
  const newPages = new Set(plan.page_map.filter((p) => p.is_new).map((p) => p.url));
  const articlePages = new Set(plan.page_map.filter((p) => p.is_new && ARTICLE.test(p.page_type)).map((p) => p.url));

  // Tidy every task: scores, priority, week, check day, ids.
  const later = [...plan.later];
  const all: MonthTask[] = [];
  for (const m of plan.months) {
    for (const t of m.tasks) {
      const month = Math.max(1, Math.min(6, Math.round(m.month)));
      const impact = clamp5(t.impact);
      const confidence = clamp5(t.confidence);
      const effort = clamp5(t.effort);
      all.push({ ...t, month, week: Math.max(1, Math.min(4, Math.round(t.week))), impact, confidence, effort, priority: priorityOf(impact, confidence, effort), check_after_days: nearestCheck(t.check_after_days) });
    }
  }

  siteWideCleanup(all, pages, notes);

  // 5. Checks that do not fit the business type.
  const fits = all.filter((t) => {
    if (business.businessType !== 'ecommerce' || !SERVICE_ONLY.test(`${t.title} ${t.change}`)) return true;
    notes.push(`Dropped "${t.title}": licences, insurance and service areas do not apply to an online shop.`);
    return false;
  });

  moveBlockers(fits, notes, BLOCKER);

  // 13. Monthly capacity: keep the highest priority in each month, the rest go to "later".
  const kindOf = (t: AiPlanTask) => {
    if (t.site_wide_item !== 'none') return null; // the clean-up does not count towards capacity
    const creates = t.urls.some((u) => newPages.has(u)) || (t.category === 'content' && NEW_PAGE.test(t.title));
    if (creates && (t.urls.some((u) => articlePages.has(u)) || ARTICLE.test(t.title))) return 'articles' as const;
    if (creates) return 'newPages' as const;
    return t.doer === 'automatic' ? ('automatic' as const) : null;
  };
  const kept: typeof fits = [];
  for (let month = 1; month <= 6; month++) {
    const used = { automatic: 0, newPages: 0, articles: 0 };
    for (const t of fits.filter((x) => x.month === month).sort((a, b) => b.priority - a.priority)) {
      const k = kindOf(t);
      if (k && used[k] >= business.capacity[k]) {
        later.push({ title: t.title, reason_deferred: `Over the month ${month} limit for ${k === 'automatic' ? 'automatic changes' : k === 'newPages' ? 'new pages' : 'articles'} on this plan.` });
        continue;
      }
      if (k) used[k]++;
      kept.push(t);
    }
  }
  const deferred = fits.length - kept.length;
  if (deferred) notes.push(`${deferred} task(s) moved to "later" to stay within the monthly capacity.`);
  if (repair) {
    // Duplicates and impossible order are cleaned before the gaps are filled, and again after (plan-dedupe.ts).
    tidyPlanTasks(kept, notes);
    notes.push(...repairPlan(kept, { ...repair, target: Math.max(MIN_TASKS, business.capacity.minTasks ?? 0), extra: topUp }));
    // Rule 4: blockers, broken links, redirects, sitemap and tracking in month 1, weeks 1–2.
    moveBlockers(kept, notes, BLOCKER_TASK);
    tidyPlanTasks(kept, notes);
  } else {
    fillMonths(kept, business.capacity.minTasks ?? 0, topUp, notes);
  }

  // Rebuild months 1–6 with unique, ordered ids; dependencies point at ids that still exist.
  const byMonth = new Map(plan.months.map((m) => [Math.round(m.month), m]));
  const rename = new Map<string, string>();
  const months = [1, 2, 3, 4, 5, 6].map((month) => {
    const src = byMonth.get(month);
    const tasks = kept
      .filter((t) => t.month === month)
      .sort((a, b) => a.week - b.week || b.priority - a.priority)
      .map((t, i) => {
        const id = `${month}.${String(i + 1).padStart(2, '0')}`;
        rename.set(t.id, id);
        const { month: _m, ...rest } = t;
        return { ...rest, id };
      });
    return { month, theme: src?.theme ?? '', goal: src?.goal ?? '', tasks };
  });
  for (const m of months) for (const t of m.tasks) t.depends_on = t.depends_on.map((d) => rename.get(d)).filter((d): d is string => Boolean(d));
  const out = { ...plan, months, later };
  const dropped = fixDependencies(out);
  if (dropped) notes.push(`Removed ${dropped} dependenc${dropped === 1 ? 'y' : 'ies'} that pointed to the same or a later task.`);
  return { plan: out, notes };
}

type MonthTask = AiPlanTask & { month: number };

/** Problems that stop Google reading the site go in month 1, weeks 1–2. */
function moveBlockers(tasks: MonthTask[], notes: string[], re: RegExp) {
  for (const t of tasks) {
    if (t.category === 'technical' && !t.recurring && t.site_wide_item === 'none' && re.test(`${t.title} ${t.change}`) && (t.month > 1 || t.week > 2)) {
      notes.push(`Moved "${t.title}" to month 1: it stops Google from reading or indexing pages.`);
      t.month = 1;
      t.week = Math.min(t.week, 2);
    }
  }
}

/**
 * Rule 31: a month with fewer than `min` tasks is topped up from the audit, content and AI search findings
 * the plan did not use yet (team tasks, so the capacity limits are not touched), highest priority first.
 */
function fillMonths(kept: MonthTask[], min: number, candidates: TopUpCandidate[], notes: string[]) {
  if (!min || !candidates.length) return;
  const used = new Set<string>();
  const keys = (t: AiPlanTask) => (t.urls.length ? t.urls.map((u) => `${t.category}|${u.toLowerCase()}`) : [`${t.category}|${t.title.toLowerCase()}`]);
  for (const t of kept) for (const k of keys(t)) used.add(k);
  const pool = candidates
    .filter((c) => !keys(c.task).some((k) => used.has(k)))
    .map((c) => ({ ...c, task: { ...c.task, impact: clamp5(c.task.impact), confidence: clamp5(c.task.confidence), effort: clamp5(c.task.effort) } }))
    .sort((a, b) => priorityOf(b.task.impact, b.task.confidence, b.task.effort) - priorityOf(a.task.impact, a.task.confidence, a.task.effort));
  let added = 0;
  for (let month = 1; month <= 6; month++) {
    let count = kept.filter((t) => t.month === month).length;
    for (let i = 0; i < pool.length && count < min; ) {
      const c = pool[i]!;
      if (c.earliest > month) {
        i++;
        continue;
      }
      pool.splice(i, 1);
      if (keys(c.task).some((k) => used.has(k))) continue;
      for (const k of keys(c.task)) used.add(k);
      kept.push({ ...c.task, id: `${month}.topup-${++added}`, month, priority: priorityOf(c.task.impact, c.task.confidence, c.task.effort) });
      count++;
    }
  }
  if (added) notes.push(`Added ${added} task(s) from the audit, content and AI search findings so each month holds at least ${min} tasks.`);
  const short = [1, 2, 3, 4, 5, 6].filter((m) => kept.filter((t) => t.month === m).length < min);
  if (short.length) notes.push(`Month${short.length > 1 ? 's' : ''} ${short.join(', ')} still hold${short.length > 1 ? '' : 's'} fewer than ${min} tasks: there were no more findings to plan.`);
}

/** Rules 20–23 on the tidied tasks (in place): month 1, canonicals first, who applies what, nothing left out, one weekly check. */
function siteWideCleanup(all: MonthTask[], pages: CleanupPage[], notes: string[]) {
  // 22. Titles, descriptions, H1s, canonicals and redirects are never changed without approval.
  for (const t of all) {
    if (t.site_wide_item === 'none' || t.site_wide_item === 'weekly_check') {
      if (t.doer === 'automatic_no_approval' && NEEDS_APPROVAL.test(`${t.title} ${t.change}`)) {
        t.doer = 'automatic';
        notes.push(`"${t.title}" changes titles, descriptions, headings, canonicals or redirects: it now waits for approval.`);
      }
      continue;
    }
    if (t.month !== 1) notes.push(`Moved "${t.title}" to month 1: the site-wide clean-up starts the plan.`);
    t.month = 1;
    t.doer = CLEANUP_DOER[t.site_wide_item];
    if (t.page_group === 'none') t.page_group = 'other';
  }

  // 20. Every item type for every page group that needs work, even if the model left it out.
  const covered = new Set(all.filter((t) => t.site_wide_item !== 'none').map((t) => `${t.site_wide_item}|${t.page_group}`));
  const missing = new Map<string, { item: CleanupItem; group: Exclude<PageGroup, 'none'>; urls: string[] }>();
  for (const p of pages) {
    for (const item of p.needs) {
      const k = `${item}|${p.group}`;
      if (covered.has(k)) continue;
      const m = missing.get(k) ?? { item, group: p.group, urls: [] };
      m.urls.push(p.url);
      missing.set(k, m);
    }
  }
  for (const m of [...missing.values()].sort((a, b) => CLEANUP_ITEMS.indexOf(a.item) - CLEANUP_ITEMS.indexOf(b.item))) {
    all.push({ ...cleanupTask(m.item, m.group, m.urls), month: 1, priority: priorityOf(m.item === 'canonical' || m.item === 'meta_title' ? 4 : 3, 4, 2) });
  }
  if (missing.size) notes.push(`Added ${missing.size} site-wide clean-up task(s) the plan had left out, so every crawled page is covered.`);

  // 23. Exactly one ongoing weekly check.
  const weekly = all.filter((t) => t.site_wide_item === 'weekly_check');
  if (!weekly.length) {
    all.push({ ...weeklyCheckTask(), month: 1, priority: priorityOf(3, 4, 1) });
    notes.push('Added the weekly check of new and changed pages.');
  }
  for (const extra of weekly.slice(1)) all.splice(all.indexOf(extra), 1);
  for (const t of all.filter((x) => x.site_wide_item === 'weekly_check')) t.month = 1;

  // 21. Canonicals before title changes: canonicals in week 1; month-1 title, description and H1 work after them.
  const canonicals = all.filter((t) => t.site_wide_item === 'canonical');
  for (const t of canonicals) t.week = 1;
  if (!canonicals.length) return;
  for (const t of all) {
    const textChange = AFTER_CANONICAL.includes(t.site_wide_item) || (t.site_wide_item === 'none' && t.category === 'on_page' && /\b(titles?|meta descriptions?|h1s?)\b/i.test(t.title));
    if (!textChange || t.month !== 1) continue;
    t.week = Math.max(t.week, 2);
    const first = canonicals.filter((c) => c.page_group === t.page_group);
    for (const c of first.length ? first : canonicals) if (!t.depends_on.includes(c.id)) t.depends_on.push(c.id);
  }
}

// ---- Into the action plan ------------------------------------------------------------------

/** The plan as saved on the action workspace; its tasks live on as actions. */
export type StoredAiPlan = Omit<AiPlan, 'months'> & {
  id: string;
  generatedAt: string;
  model: string;
  tokens: number;
  startDate: string;
  tier: PlanTier;
  capacity: PlanCapacity;
  businessType: BusinessKind;
  months: { month: number; theme: string; goal: string }[];
  /** What `checkPlan()` changed in the model's answer. */
  notes: string[];
  /** The audit issues and site-check problems the plan was written from (issue_register.csv). */
  issues?: PlanIssue[];
  /** Issues only a developer can fix, left out of the plan (rule 3). */
  needsDeveloper?: NeedsDeveloper[];
  /** Rule 11: the new title and description per page, as the model wrote them. */
  pageMeta?: { url: string; title: string; description: string }[];
  /** Pages whose title or description stayed as it is because no draft passed the rules: for a person to review. */
  metaReview?: MetaReview[];
  /** RULES 1–11 checked in code. */
  validation?: ValidationLine[];
  platform?: PlanPlatform;
  /** Business inputs the plan was written with (shown in plan.md and the files). */
  business?: PlanBusiness;
};

const OWNER: Record<TaskDoer, string> = { automatic: 'Automatic (after approval)', automatic_no_approval: 'Automatic (no approval needed)', team: 'SEO team', developer: 'Developer', client: 'Client' };

/** Untouched by a person: still to do, not approved, not moved, not applied, no exact changes attached. */
const untouched = (a: ActionItem) =>
  // The plan's own changes (rule 11 titles and descriptions) do not count as a person's work.
  a.status === 'todo' && !a.approvedAt && !a.applied && (!a.changes?.length || a.source.kind === 'ai') &&
  // AI tasks come with a month and an owner; the older automatic actions had neither until a person set them.
  (a.source.kind === 'ai' || (!a.bucketLocked && !a.owner));

/**
 * Replaces the plan: actions nobody has touched (the old automatic list and the previous AI plan's
 * open tasks) give way to the new tasks; anything started, approved, done, moved by hand or holding
 * exact page changes stays.
 */
export function applyAiPlan(
  ws: ActionWorkspace,
  checked: CheckedPlan,
  meta: { model: string; tokens: number; business: PlanBusiness },
  ctx: { newId: () => string; now?: Date; report?: ReportModel | null; gsc?: { url: string; clicks: number; impressions: number }[] | null; /** Regenerate: start over, keeping only finished work and changes already applied to the site. */ fresh?: boolean },
): ActionWorkspace {
  const now = ctx.now ?? new Date();
  const iso = now.toISOString();
  const start = Date.parse(`${meta.business.startDate}T00:00:00Z`);
  const planId = ctx.newId();
  const keep = ctx.fresh
    ? ws.actions.filter((a) => a.status === 'done' || a.status === 'verified' || Boolean(a.applied))
    : ws.actions.filter((a) => a.status === 'dismissed' || !untouched(a));
  const added: ActionItem[] = checked.plan.months.flatMap((m) =>
    m.tasks.map((t): ActionItem => {
      const blocker = m.month === 1 && t.week <= 2 && t.category === 'technical';
      const s: Suggestion = {
        source: { kind: 'ai', planId, taskId: t.id },
        title: t.title,
        detail: [t.why, t.change].filter(Boolean).join(' '),
        severity: blocker && t.impact >= 4 ? 'critical' : t.priority >= 10 ? 'high' : t.priority >= 5 ? 'medium' : 'low',
        impact: t.impact,
        confidence: t.confidence,
        effort: t.effort,
        priority: t.priority,
        // A site-wide clean-up task covers every page of its group.
        urls: t.urls.slice(0, t.site_wide_item === 'none' ? 20 : 200),
      };
      return {
        ...s,
        id: ctx.newId(),
        owner: OWNER[t.doer],
        dueDate: new Date(start + ((m.month - 1) * 4 + t.week) * 7 * 86_400_000).toISOString().slice(0, 10),
        // Software changes the client's site only after their yes.
        approval: t.doer === 'automatic' ? 'client' : 'none',
        approvedAt: null,
        approvedBy: null,
        status: 'todo',
        bucket: ACTION_BUCKETS[m.month - 1]!,
        bucketLocked: true,
        before: beforeState(s, ctx.report, ctx.gsc ?? null, now),
        doneAt: null,
        checkpoints: [],
        plan: {
          taskId: t.id, month: m.month, week: t.week, doer: t.doer, category: t.category, why: t.why, change: t.change,
          keywords: t.keywords.slice(0, 10), dependsOn: t.depends_on, successCheck: t.success_check, checkAfterDays: t.check_after_days,
          ...(t.site_wide_item !== 'none' ? { siteWideItem: t.site_wide_item, pageGroup: t.page_group } : {}),
          ...(t.area ? { area: t.area } : {}),
          ...(t.issue_ids?.length ? { issueIds: t.issue_ids } : {}),
          ...(t.recurring ? { recurring: true } : {}),
        },
        createdAt: iso,
        updatedAt: iso,
      };
    }),
  );
  const { months, ...rest } = checked.plan;
  return {
    ...ws,
    actions: [...keep, ...added],
    updatedAt: iso,
    aiPlan: {
      ...rest,
      id: planId,
      generatedAt: iso,
      model: meta.model,
      tokens: meta.tokens,
      startDate: meta.business.startDate,
      tier: meta.business.tier,
      capacity: meta.business.capacity,
      businessType: meta.business.businessType,
      months: months.map((m) => ({ month: m.month, theme: m.theme, goal: m.goal })),
      notes: checked.notes,
    },
  };
}

/** Backlinks and Business Profile summaries from the saved Module 8 and 9 results. */
export function planExtrasFrom(args: {
  gsc?: PlanExtras['gsc'];
  backlinks?: { audit: { summary: { referringDomains: number | null }; competitors: { domain: string; referringDomains: number | null }[]; gap: { domain: string }[]; broken?: unknown[] } | null } | null;
  local?: { profile: { title: string; rating: number | null; reviews: number | null; category: string | null; claimed: boolean | null } | null } | null;
  aeo?: AeoWorkspace | null;
  content?: ContentAudit | null;
}): PlanExtras {
  const b = args.backlinks?.audit;
  const p = args.local?.profile;
  return {
    aiSearch: aiSearchSummary(args.aeo?.audit ?? null),
    content: contentSummary(args.content ?? null),
    gsc: args.gsc ?? null,
    backlinks: b ? { referringDomains: b.summary.referringDomains, competitors: b.competitors.map((c) => ({ domain: c.domain, referringDomains: c.referringDomains })), gap: b.gap.slice(0, 20).map((g) => g.domain), broken: b.broken?.length } : null,
    local: p ? { name: p.title, rating: p.rating, reviews: p.reviews, category: p.category, claimed: p.claimed } : null,
  };
}

const ASSISTANT: Record<string, string> = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', overview: 'AI Overviews', aio: 'AI Overviews', gemini: 'Gemini' };

function aiSearchSummary(a: AeoAudit | null): PlanAiSearch | null {
  if (!a) return null;
  const all = a.share.all ?? [];
  return {
    checked_at: a.runAt.slice(0, 10),
    your_share_of_voice: all.find((x) => x.you)?.share ?? null,
    competitors_named_instead: all.filter((x) => !x.you && x.mentions > 0).slice(0, 5).map((x) => ({ domain: x.domain, share: x.share })),
    questions_where_you_are_not_named: [...new Set(a.answers.filter((x) => !x.error && !x.shown).map((x) => x.prompt))].slice(0, 10),
    blocked_crawlers: a.crawlers.filter((c) => !c.allowed && !/training/i.test(c.purpose)).map((c) => `${c.bot} (${c.purpose})`),
    missing_entity_signals: a.entity.filter((x) => !x.ok).map((x) => `${x.label}: ${x.detail}`),
    answer_ready_problems: a.answerReady.filter((x) => x.status === 'fail' || x.status === 'warn').map((x) => `${x.label}: ${x.message}`),
    wrong_facts: (a.accuracy?.rows ?? []).filter((r) => r.ok === false).map((r) => `${r.topic}: AI says "${r.aiSays}", actually "${r.actual}"`),
    cited_sources: a.sources.slice(0, 10).map((x) => x.domain),
    snippet_controls: a.controls.slice(0, 5).map((c) => `${c.url}: ${c.issue}`),
    missing_third_party: a.thirdParty.filter((x) => !x.ok).map((x) => x.label),
    answers: a.answers.filter((x) => !x.error).slice(0, 60).map((x) => ({ question: x.prompt, assistant: ASSISTANT[x.assistant] ?? x.assistant, mentioned: x.shown, cited: x.cited.slice(0, 5) })),
  };
}

function contentSummary(c: ContentAudit | null): PlanContent | null {
  if (!c) return null;
  return {
    pages: c.inventory.filter((r) => r.verdict !== 'keep').slice(0, 40).map((r) => ({ url: r.url, verdict: r.verdict, reason: r.reason, clicks: r.clicks, position: r.position })),
    decay: c.decay.slice(0, 15).map((r) => ({ url: r.url, change: r.change, clicks: r.clicks })),
    topic_gaps: c.topicGap.slice(0, 15).map((g) => `${g.topic}: ${g.detail}`),
    weak_quality: c.quality.filter((q) => Math.min(q.original, q.accurate, q.experience) <= 2).map((q) => ({ url: q.url, note: q.note })),
  };
}

/**
 * Builds the input, sends the plan prompt (plan-prompt.ts) in one call, checks and repairs the answer
 * (checkPlan + RULES 1–10 in plan-validate.ts) and puts its tasks in the action plan.
 */
export async function writeAiPlan(
  client: OpenAiClient,
  ws: ActionWorkspace,
  args: Parameters<typeof buildPlanInput>[0],
  ctx: {
    newId: () => string; now?: Date; report?: ReportModel | null; gsc?: { url: string; clicks: number; impressions: number }[] | null; fresh?: boolean;
    /** Drafted alt text per page URL (Module 2 alt-text drafts); not used by the one-call prompt. */
    altDrafts?: Map<string, { image: string; alt: string }[]>;
    onProgress?: (step: string) => void | Promise<void>;
  },
): Promise<{ workspace: ActionWorkspace; tokens: number }> {
  // Every input must belong to this website: a plan is never built from another site's data.
  assertSameSite(args.domain, [
    { label: 'action plan', domain: ws.domain },
    { label: 'keyword research', domain: args.keywords.domain },
    { label: 'page plan', domain: args.mapping?.domain },
    { label: 'audit', domain: args.report?.project?.domain },
    ...(args.sources ?? []),
  ]);
  const own = siteQuestions(args.keywords, 100);
  const ownSet = new Set(own.questions);
  if (args.extras?.aiSearch) {
    // AI search answers to questions that are not this website's (left in its workspace by an older run) are left out.
    const ai = args.extras.aiSearch;
    args = { ...args, extras: { ...args.extras, aiSearch: { ...ai, answers: ai.answers?.filter((a) => ownSet.has(a.question)), questions_where_you_are_not_named: ai.questions_where_you_are_not_named.filter((q) => ownSet.has(q)) } } };
  }
  const input = buildPlanInput(args);
  const b = input.business;
  const pages = input.data.site_wide_pages as CleanupPage[];
  const local = b.businessType === 'local_service' || b.businessType === 'local_shop';
  const platform = platformOf(args.report, args.connected);
  const check = siteCheck(args.report, pages);
  const audit = auditIssues(args.report);
  const issues = [...audit, ...check.issues];
  const questions = input.data.ai_questions as string[];
  const listed = pagesBlock(args.report, pages, args.mapping);
  const prompt = planPrompt({
    business: businessBlock(b, { platform, suffix: titleSuffix(args.report?.pages ?? []), software: softwareCan(platform, Boolean(args.connected)) }),
    audit, siteCheck: check.lines, keywords: keywordsBlock(args.keywords, args.mapping, args.extras?.gsc ?? null),
    ai: aiVisibilityBlock(args.extras?.aiSearch ?? null, questions), offpage: offpageBlock(args.extras, local), pages: listed.text,
  }, b.capacity.minTasks);

  await ctx.onProgress?.('Writing the 6-month plan');
  const asked = await askForPlan(client, prompt);
  await ctx.onProgress?.('Checking the plan against the rules');
  const raw = toAiPlan(asked.answer);
  // Page map and left-out keywords come from the page plan and keyword research (no model tokens).
  // One row per page (topics on the same page, or repeating each other, share it).
  raw.page_map = (args.mapping ? pageCards(args.mapping, args.keywords.keywords, args.report?.pages ?? [], args.keywords.seeds.locations) : []).slice(0, 60).map((c) => ({
    url: c.url ?? c.suggestedPath ?? '', is_new: !c.url, page_type: c.rows[0]!.newPageType ?? (c.url ? 'existing page' : 'new page'), main_keyword: c.primary.term,
    supporting_keywords: [...c.secondary, ...c.informational].slice(0, 6).map((k) => k.term), total_monthly_volume: c.rows.reduce((s, r) => s + r.volume, 0),
  }));
  raw.removed_keywords = args.keywords.keywords.filter((k) => k.status === 'removed').sort((x, y) => (y.volume ?? 0) - (x.volume ?? 0)).slice(0, 30).map((k) => ({ keyword: k.term, reason: k.removeReason ?? 'removed' }));
  const needsDeveloper = [...asked.answer.needs_developer];
  // Drafted titles and descriptions are checked in code; good current text is kept, failing drafts are
  // re-asked once and otherwise kept as they are and flagged for review (plan-meta.ts).
  const rawPages = new Map((args.report?.pages ?? []).map((p) => [normPlanUrl(p.url), p]));
  // The highest-priority topic on a page gives its main keyword (rows are in priority order).
  const mainKw = new Map((args.mapping?.rows ?? []).filter((r) => r.url && r.primaryKeyword).reverse().map((r) => [normPlanUrl(r.url!), r.primaryKeyword]));
  const metaPages = new Map<string, MetaPage>(listed.urls.map((u) => [u, { url: u, title: rawPages.get(normPlanUrl(u))?.title ?? null, description: rawPages.get(normPlanUrl(u))?.description ?? null, mainKeyword: mainKw.get(normPlanUrl(u)) ?? null }]));
  const settled = await settlePageMeta(client, pageMetaRows(asked.answer.page_meta, listed.urls), metaPages, { suffix: titleSuffix(args.report?.pages ?? []), brand: args.domain.replace(/^www\./, '').split('.')[0] ?? null });
  const pageMeta = settled.rows;
  ensureMetaBatches(raw, pageMeta, pages);
  const topUp = topUpCandidates({ report: args.report, extras: args.extras, prompts: questions, domain: args.domain, kind: b.businessType });
  const checked = checkPlan(raw, b, pages, topUp, { issues, needsDeveloper, questions: questions.length });
  if (settled.kept || settled.review.length || settled.fixed) checked.notes.unshift(`Titles and descriptions: ${settled.kept} good current one(s) kept instead of a draft, ${settled.fixed} draft(s) fixed on a second try, ${settled.review.length} left as they are for a person to review.`);
  if (own.dropped.length) checked.notes.unshift(`Left out ${own.dropped.length} AI question(s) that are not about this website (e.g. "${own.dropped[0]}").`);
  const validation = validatePlan(checked.plan, { issues, needsDeveloper, pages, capacity: b.capacity, banned: b.bannedWords ?? [], pageMeta, listedUrls: listed.urls, metaReview: settled.review });
  const workspace = applyAiPlan(ws, checked, { model: asked.model, tokens: asked.tokens, business: b }, ctx);
  workspace.aiPlan = { ...workspace.aiPlan!, issues, needsDeveloper, validation, business: b, platform, pageMeta, metaReview: settled.review };
  attachPageMeta(workspace, pageMeta, args.report, pages);
  namePlanActions(workspace, { report: args.report, pages, kind: b.businessType, suffix: titleSuffix(args.report?.pages ?? []) });
  return { workspace, tokens: asked.tokens + settled.tokens };
}

// ---- Rule 11: a new title and description for every page -------------------------------------

/** The model's rows for listed pages only, one per page, with the address exactly as listed. */
function pageMetaRows(rows: { url: string; title: string; description: string }[], listed: string[]) {
  const byKey = new Map(listed.map((u) => [normPlanUrl(u), u]));
  const out = new Map<string, { url: string; title: string; description: string }>();
  for (const r of rows) {
    const url = byKey.get(normPlanUrl(r.url));
    if (url && !out.has(url)) out.set(url, { url, title: r.title.trim(), description: r.description.trim() });
  }
  return [...out.values()];
}

/** Month 1 needs a title batch and a description batch for every page group with new text in page_meta. */
function ensureMetaBatches(plan: AiPlan, rows: { url: string; title: string; description: string }[], pages: CleanupPage[]) {
  const month1 = plan.months.find((m) => Math.round(m.month) === 1) ?? (plan.months.push({ month: 1, theme: '', goal: '', tasks: [] }), plan.months.at(-1)!);
  const groupOf = new Map(pages.map((p) => [normPlanUrl(p.url), p.group]));
  for (const item of ['meta_title', 'meta_description'] as const) {
    const urls = rows.filter((r) => !isKeep(item === 'meta_title' ? r.title : r.description)).map((r) => r.url);
    if (!urls.length) continue;
    const have = plan.months.flatMap((m) => m.tasks).filter((t) => t.site_wide_item === item);
    const byGroup = new Map<Exclude<PageGroup, 'none'>, string[]>();
    for (const u of urls) {
      const g = groupOf.get(normPlanUrl(u)) ?? 'other';
      byGroup.set(g, [...(byGroup.get(g) ?? []), u]);
    }
    for (const [g, us] of byGroup) if (!have.some((t) => t.page_group === g)) month1.tasks.push(cleanupTask(item, g, us));
  }
}

/** Puts each new title and description on the Month 1 batch that covers its page, as a change to approve. */
function attachPageMeta(ws: ActionWorkspace, rows: { url: string; title: string; description: string }[], report: ReportModel | null | undefined, pages: CleanupPage[]) {
  const planId = ws.aiPlan?.id;
  const raw = new Map((report?.pages ?? []).map((p) => [normPlanUrl(p.url), p]));
  const groupOf = new Map(pages.map((p) => [normPlanUrl(p.url), p.group]));
  const month1 = ws.actions.filter((a) => a.source.kind === 'ai' && a.source.planId === planId && a.plan?.month === 1);
  const pathOf = (u: string) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  };
  for (const item of ['meta_title', 'meta_description'] as const) {
    const batches = month1.filter((a) => a.plan!.siteWideItem === item);
    if (!batches.length) continue;
    for (const r of rows) {
      const suggested = item === 'meta_title' ? r.title : r.description;
      if (isKeep(suggested)) continue;
      const key = normPlanUrl(r.url);
      const target = batches.find((a) => a.urls.some((u) => normPlanUrl(u) === key)) ?? batches.find((a) => a.plan!.pageGroup === groupOf.get(key)) ?? batches[0]!;
      const now = item === 'meta_title' ? raw.get(key)?.title : raw.get(key)?.description;
      target.changes = [...(target.changes ?? []), {
        id: item === 'meta_title' ? 'title' : 'meta', label: `${item === 'meta_title' ? 'Title tag' : 'Meta description'} · ${pathOf(r.url)}`,
        now: now || '(missing)', suggested, data: { url: r.url },
      }];
      if (!target.urls.some((u) => normPlanUrl(u) === key)) target.urls = [...target.urls, r.url];
    }
  }
}

/** A plan this old is written again by autopilot (and customers may ask for a new one after a week). */
export const AI_PLAN_EVERY_DAYS = 30;
export const AI_PLAN_CUSTOMER_COOLDOWN_DAYS = 7;
