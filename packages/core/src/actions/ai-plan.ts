import { z } from 'zod';
import { dedupeKey, normTerm } from '../keywords/clean';
import type { KeywordWorkspace } from '../keywords/types';
import type { MappingWorkspace } from '../mapping/mapping';
import type { OpenAiClient } from '../providers/openai';
import type { ReportModel } from '../types';
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
/** Work per month the plan may hold: changes software applies after approval, new pages, new articles. */
export type PlanCapacity = { automatic: number; newPages: number; articles: number };
export const PLAN_CAPACITY: Record<PlanTier, PlanCapacity> = {
  autopilot: { automatic: 15, newPages: 2, articles: 1 },
  growth: { automatic: 40, newPages: 4, articles: 4 },
};

/** Monthly capacity from the admin settings (`plan.<tier>.*`), else the defaults above. */
export function capacityFor(settings: Partial<Record<string, unknown>>, tier: PlanTier): PlanCapacity {
  const n = (k: keyof PlanCapacity) => {
    const v = Number(settings[`plan.${tier}.${k}`]);
    return Number.isFinite(v) && v >= 0 ? v : PLAN_CAPACITY[tier][k];
  };
  return { automatic: n('automatic'), newPages: n('newPages'), articles: n('articles') };
}

export const TASK_CATEGORIES = ['technical', 'on_page', 'content', 'off_page', 'local', 'tracking'] as const;
/** automatic = software applies it after approval; automatic_no_approval = software applies it straight away (rule 22). */
export const TASK_DOERS = ['automatic', 'automatic_no_approval', 'team', 'client'] as const;
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
        }),
      },
    }),
  },
  later: { type: 'array', items: obj({ title: str, reason_deferred: str }) },
  data_gaps: strs,
});

export const AI_PLAN_SYSTEM = `You are a senior SEO strategist building a 6-month SEO action plan for one website.
The plan will be shown to a non-expert business owner and carried out partly by software (some changes go live straight away, others after the client approves them) and partly by an SEO team.
Accuracy and relevance matter more than the number of tasks. The user message holds <business> and <data> as JSON.

<rules>
A. Check and group keywords before planning
1. Remove a keyword if it is irrelevant to what the business sells, if it names a competitor or a brand the business does not stock, if it has the wrong intent for any page the business could own (jobs, wholesale for a retail-only shop, DIY), or if it is a health or legal claim the business cannot safely make. Record each removed keyword with a one-line reason.
2. Group the remaining keywords into topics: keywords that Google would answer with the same page (synonyms, plurals, near variants) belong together.
3. Assign each topic to exactly ONE page: an existing URL if one fits, otherwise a proposed new URL. Pick one main keyword per page; the rest are supporting. No keyword on two pages.
4. Send learning or comparison topics ("how to", "best X", "X vs Y") to articles or guides, not to product, category or service pages.

B. Use only checks that fit the business type
5. Ecommerce: category and product page optimisation, Product and ItemList schema, reviews, delivery and returns information, faceted navigation and duplicate URLs, out-of-stock handling. Do NOT suggest licences, insurance or service-area checks unless the business is a service.
6. Local service or shop: Business Profile, NAP consistency, LocalBusiness schema, service and location pages, reviews.

C. Order of work
7. Month 1, weeks 1–2: anything that stops Google from crawling, indexing or rendering money pages (robots/noindex blocks, pages not indexed, sitemap, broken pages and links, severe mobile speed problems), plus tracking checks and a recorded baseline.
8. Month 1, weeks 3–4, then Month 2: pages already ranking in positions 4–20 for high-value keywords: titles, H1s, meta descriptions, opening text, internal links. Do title and meta fixes as one batch per page, never as separate tasks spread across months.
9. Months 2–3: merge or redirect pages that compete for the same topic; expand thin money pages compared with the pages that rank.
10. Months 3–5: create new pages and articles from the topic groups, highest value first; then internal links into them.
11. Throughout, at a steady pace: off-page work that fits the business type (links from the link gap, reviews, listings, Business Profile, digital PR).
12. Plan seasonal content and pages at least 6–8 weeks before the peak.
13. Never schedule more work in a month than the stated capacity. If there is more work, keep the highest-scoring tasks and list the rest as "later". The site-wide clean-up (rules 20–23) does not count towards the capacity.

D. Scoring
14. Score each task: impact (1–5: traffic and revenue potential, using volume, position and intent), confidence (1–5), effort (1–5). Priority = impact × confidence ÷ effort. Use priority to order tasks within the constraints of rules 7–13.

E. Every task must be specific
15. Name the exact URL(s), the keywords, what changes (before → after where possible) and why, in one plain sentence a business owner understands.
16. Mark who does it: "automatic" (software applies it after the client approves: SEO titles, meta descriptions, H1s, canonicals, redirects, draft pages), "automatic_no_approval" (software applies it straight away: image alt text, Open Graph tags, fixes for new pages), "team" or "client".
17. Give a measurable success check and the day to check it (7, 14 or 28 days after the change).
18. List dependencies by task id (e.g. "1.3").
19. Do not invent data. If something needed is missing, add it to "data_gaps" instead of guessing. Use only URLs from the crawl summary, or clearly new URLs on the same domain.

F. Site-wide on-page clean-up (always include)
20. In Month 1, include one task per item type that covers EVERY indexable page from the crawl (data.site_wide_pages), not only pages in the keyword map: meta titles, meta descriptions, H1, canonical tags, image alt text, Open Graph tags. Group by page type (money pages, products, collections, articles, other) so each group can be approved in one action. List the group's URLs in "urls". Set "site_wide_item" to the item type and "page_group" to the group; every other task uses "none" for both.
21. Canonical fixes come before title changes. Self-referencing canonicals on indexable pages; variant, filter, tag, pagination and nested product URLs point to the clean URL.
22. Alt text, Open Graph tags and fixes for new pages are "automatic_no_approval". Titles, descriptions, H1s and canonicals are "automatic" (after approval).
23. Add one ongoing task: check new and changed pages weekly and apply the same rules (site_wide_item "weekly_check", page_group "none").
</rules>

Task ids are "<month>.<n>". Months are 1 to 6. Weeks are 1 to 4. Write for a business owner: plain words, no jargon.
Before answering, check your plan against every rule. In particular: no keyword appears on two pages, no task uses a check that does not fit the business type, every blocker sits in Month 1, no month exceeds capacity, the site-wide clean-up covers every indexable page in Month 1 with canonicals first, and there is exactly one weekly check task.`;

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
};
export type PlanExtras = {
  gsc?: { query: string; page?: string; clicks: number; impressions: number; position: number }[] | null;
  backlinks?: { referringDomains: number | null; competitors: { domain: string; referringDomains: number | null }[]; gap: string[] } | null;
  local?: { name: string | null; rating: number | null; reviews: number | null; category: string | null; claimed: boolean | null } | null;
};
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
  const pages = allPages.slice(0, 60);
  // Links into each page from the other checked pages (the crawl keeps each page's outgoing links).
  const key = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const inlinks = new Map<string, number>();
  for (const p of allPages) for (const l of new Set(p.links.map(key))) if (l !== key(p.url)) inlinks.set(l, (inlinks.get(l) ?? 0) + 1);
  const issues = (args.report?.issues ?? [])
    .filter((i) => i.severity !== 'info' && (i.status === 'fail' || i.status === 'warn'))
    .slice(0, 40)
    .map((i) => ({ issue: i.title.expert, severity: i.severity, affected: i.affectedCount ?? i.urls.length, urls: i.urls.slice(0, 5) }));
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
    },
    data: {
      site_wide_pages: cleanupPages(allPages, kind),
      crawl_summary: pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, words: p.words, inlinks: inlinks.get(key(p.url)) ?? 0, page_type: p.pageType })),
      audit_score: args.report?.overall.score ?? null,
      audit_issues: issues,
      search_console_90_days: args.extras?.gsc ? gsc : 'not connected',
      keyword_research: kept.map((k) => ({ keyword: k.term, volume: k.volume, difficulty: k.difficulty, intent: k.intent, position: k.position, ranking_url: k.url })),
      topics: kw.clusters.slice(0, 40).map((c) => ({ topic: c.name, searches: c.volume, priority: c.priority, page_type: c.pageType, best_position: c.bestPosition })),
      page_plan: (args.mapping?.rows ?? []).slice(0, 40).map((r) => ({ topic: r.topic, page: r.url, action: r.action, main_keyword: r.primaryKeyword, competing_pages: r.conflicts.map((c) => c.url) })),
      competitor_gaps: [...gap].slice(0, 5).map(([domain, terms]) => ({ competitor: domain, keywords_they_rank_for_and_we_do_not: terms.slice(0, 15) })),
      backlinks: args.extras?.backlinks ?? 'not checked',
      business_profile: args.extras?.local ?? (kind === 'ecommerce' ? 'not relevant' : 'not checked'),
    },
  };
}

export async function generateAiPlan(client: OpenAiClient, input: PlanInput): Promise<{ plan: AiPlan; tokens: number; model: string }> {
  const r = await client.generateJson({
    system: AI_PLAN_SYSTEM,
    user: JSON.stringify(input),
    name: 'seo_action_plan',
    jsonSchema: AI_PLAN_JSON_SCHEMA,
    parse: aiPlanSchema,
    maxOutputTokens: 16_000,
    timeoutMs: 240_000,
  });
  return { plan: r.data, tokens: r.tokens, model: r.model };
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
export function checkPlan(raw: AiPlan, business: Pick<PlanBusiness, 'businessType' | 'capacity'>, pages: CleanupPage[] = []): CheckedPlan {
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

  // 7. Blockers belong in month 1, weeks 1–2.
  for (const t of fits) {
    if (t.category === 'technical' && BLOCKER.test(`${t.title} ${t.change}`) && (t.month > 1 || t.week > 2)) {
      notes.push(`Moved "${t.title}" to month 1: it stops Google from reading or indexing pages.`);
      t.month = 1;
      t.week = Math.min(t.week, 2);
    }
  }

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

  // Rebuild months 1–6 with unique, ordered ids; dependencies point at ids that still exist.
  const byMonth = new Map(plan.months.map((m) => [Math.round(m.month), m]));
  const rename = new Map<string, string>();
  const months = [1, 2, 3, 4, 5, 6].map((month) => {
    const src = byMonth.get(month);
    const tasks = kept
      .filter((t) => t.month === month)
      .sort((a, b) => a.week - b.week || b.priority - a.priority)
      .map((t, i) => {
        const id = `${month}.${i + 1}`;
        rename.set(t.id, id);
        const { month: _m, ...rest } = t;
        return { ...rest, id };
      });
    return { month, theme: src?.theme ?? '', goal: src?.goal ?? '', tasks };
  });
  for (const m of months) for (const t of m.tasks) t.depends_on = t.depends_on.map((d) => rename.get(d)).filter((d): d is string => Boolean(d));
  return { plan: { ...plan, months, later }, notes };
}

type MonthTask = AiPlanTask & { month: number };

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
};

const OWNER: Record<TaskDoer, string> = { automatic: 'Automatic (after approval)', automatic_no_approval: 'Automatic (no approval needed)', team: 'SEO team', client: 'Client' };

/** Untouched by a person: still to do, not approved, not moved, not applied, no exact changes attached. */
const untouched = (a: ActionItem) =>
  a.status === 'todo' && !a.approvedAt && !a.applied && !a.changes?.length &&
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
  backlinks?: { audit: { summary: { referringDomains: number | null }; competitors: { domain: string; referringDomains: number | null }[]; gap: { domain: string }[] } | null } | null;
  local?: { profile: { title: string; rating: number | null; reviews: number | null; category: string | null; claimed: boolean | null } | null } | null;
}): PlanExtras {
  const b = args.backlinks?.audit;
  const p = args.local?.profile;
  return {
    gsc: args.gsc ?? null,
    backlinks: b ? { referringDomains: b.summary.referringDomains, competitors: b.competitors.map((c) => ({ domain: c.domain, referringDomains: c.referringDomains })), gap: b.gap.slice(0, 20).map((g) => g.domain) } : null,
    local: p ? { name: p.title, rating: p.rating, reviews: p.reviews, category: p.category, claimed: p.claimed } : null,
  };
}

/** Builds the input, asks the model, checks the answer and puts its tasks in the action plan. */
export async function writeAiPlan(
  client: OpenAiClient,
  ws: ActionWorkspace,
  args: Parameters<typeof buildPlanInput>[0],
  ctx: { newId: () => string; now?: Date; report?: ReportModel | null; gsc?: { url: string; clicks: number; impressions: number }[] | null; fresh?: boolean },
): Promise<{ workspace: ActionWorkspace; tokens: number }> {
  const input = buildPlanInput(args);
  const { plan, tokens, model } = await generateAiPlan(client, input);
  const checked = checkPlan(plan, input.business, input.data.site_wide_pages as CleanupPage[]);
  return { workspace: applyAiPlan(ws, checked, { model, tokens, business: input.business }, ctx), tokens };
}

/** A plan this old is written again by autopilot (and customers may ask for a new one after a week). */
export const AI_PLAN_EVERY_DAYS = 30;
export const AI_PLAN_CUSTOMER_COOLDOWN_DAYS = 7;
