import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import type { ReportModel } from '../types';
import type { AiPlan, AiPlanTask, PlanInput } from './ai-plan';
import { TASK_CATEGORIES, TASK_DOERS } from './plan-constants';
import { PAGE_GROUPS, SITE_WIDE_ITEMS, type CleanupPage } from './cleanup';
import { analysisSystem, fixesSystem, monthSystem, overviewSystem } from './plan-prompts';

/**
 * Runs the strategist prompt in stages (see plan-prompts.ts): analysis → page fix sheet (batches, lengths
 * and duplicates rechecked and sent back once) → months 1 to 6, one call each → overview. The result is an
 * AiPlan plus the analysis and fix sheet; checks and repairs follow in checkPlan() and validatePlan().
 */
export const AUDIT_AREAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];
export const AREA_LABEL: Record<AuditArea, string> = {
  A: 'Crawling and indexing', B: 'Canonical tags', C: 'Meta titles', D: 'Meta descriptions', E: 'Headings', F: 'Images', G: 'Content',
  H: 'URLs and internal links', I: 'Structured data', J: 'Speed and UX', K: 'Social', L: 'Keywords and opportunities', M: 'Off-page',
  N: 'Local', O: 'Ecommerce', P: 'AI search', Q: 'Tracking',
};
const STATUSES = ['Pass', 'Fail', 'Partial', 'Not applicable', 'No data'] as const;
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'None'] as const;
const ISSUE_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

// ---- Schemas (zod + strict JSON Schema) -----------------------------------------------------

const str = { type: 'string' };
const num = { type: 'number' };
const numOrNull = { type: ['number', 'null'] };
const bool = { type: 'boolean' };
const strs = { type: 'array', items: str };
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const arr = (items: unknown) => ({ type: 'array', items });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

const issueZ = z.object({
  issue_id: z.string(), area: z.enum(AUDIT_AREAS), issue: z.string(), severity: z.enum(ISSUE_SEVERITIES), affected_url_count: z.number(),
  example_urls: z.array(z.string()), fix: z.string(), impact: z.number(), confidence: z.number(), effort: z.number(), doer: z.enum(TASK_DOERS),
});
export type PlanIssue = z.infer<typeof issueZ> & { priority?: number };
const offpageZ = z.object({ month: z.number(), title: z.string(), method: z.string(), targets: z.array(z.string()), monthly_number: z.string() });
export type OffpageItem = z.infer<typeof offpageZ>;
const checklistZ = z.object({ area: z.enum(AUDIT_AREAS), item: z.string(), status: z.enum(STATUSES), evidence: z.string(), severity: z.enum(SEVERITIES) });
export type ChecklistLine = z.infer<typeof checklistZ>;
const keywordMapZ = z.object({ url: z.string(), main_keyword: z.string(), supporting_keywords: z.array(z.string()), volume: z.number().nullable(), position: z.number().nullable() });
const studyZ = z.object({
  business_type: z.string(), sells: z.string(), buyers: z.string(), revenue_model: z.string(),
  page_inventory: z.array(z.object({ type: z.string(), count: z.number() })), money_pages: z.array(z.string()), top_impression_pages: z.array(z.string()),
  platform: z.string(), platform_issues: z.array(z.string()),
});
export type SiteStudy = z.infer<typeof studyZ>;

export const analysisZ = z.object({
  study: studyZ, checklist: z.array(checklistZ), issues: z.array(issueZ), offpage: z.array(offpageZ),
  keyword_map: z.array(keywordMapZ), removed_keywords: z.array(z.object({ keyword: z.string(), reason: z.string() })), data_gaps: z.array(z.string()),
});
export type PlanAnalysis = z.infer<typeof analysisZ>;
const ANALYSIS_SCHEMA = obj({
  study: obj({ business_type: str, sells: str, buyers: str, revenue_model: str, page_inventory: arr(obj({ type: str, count: num })), money_pages: strs, top_impression_pages: strs, platform: str, platform_issues: strs }),
  checklist: arr(obj({ area: en(AUDIT_AREAS), item: str, status: en(STATUSES), evidence: str, severity: en(SEVERITIES) })),
  issues: arr(obj({ issue_id: str, area: en(AUDIT_AREAS), issue: str, severity: en(ISSUE_SEVERITIES), affected_url_count: num, example_urls: strs, fix: str, impact: num, confidence: num, effort: num, doer: en(TASK_DOERS) })),
  offpage: arr(obj({ month: num, title: str, method: str, targets: strs, monthly_number: str })),
  keyword_map: arr(obj({ url: str, main_keyword: str, supporting_keywords: strs, volume: numOrNull, position: numOrNull })),
  removed_keywords: arr(obj({ keyword: str, reason: str })),
  data_gaps: strs,
});

const fixRowZ = z.object({
  url: z.string(), main_keyword: z.string(), new_title: z.string(), new_meta: z.string(), new_h1: z.string(), h1_fix: z.string(),
  correct_canonical: z.string(), canonical_action: z.string(), other_fixes: z.array(z.string()), priority: z.enum(['High', 'Medium', 'Low']),
});
const fixesZ = z.object({ rows: z.array(fixRowZ) });
const FIXES_SCHEMA = obj({
  rows: arr(obj({ url: str, main_keyword: str, new_title: str, new_meta: str, new_h1: str, h1_fix: str, correct_canonical: str, canonical_action: str, other_fixes: strs, priority: en(['High', 'Medium', 'Low']) })),
});

/** One row of the page fix sheet (Step 3): the model's fixes merged with the crawl's current values. */
export type PlanPageFix = z.infer<typeof fixRowZ> & {
  page_type: string;
  current_title: string | null;
  title_length: number | null;
  current_meta: string | null;
  meta_length: number | null;
  current_h1s: string;
  current_canonical: string | null;
  images_total: number | null;
  images_missing_alt: number | null;
  alt_fixes: { image: string; alt: string; verify: boolean }[];
  /** Set when the fix sheet could not meet a rule and the value was kept. */
  note?: string;
};

const taskJson = obj({
  id: str, week: num, title: str, area: en(AUDIT_AREAS), category: en(TASK_CATEGORIES), why: str, urls: strs, keywords: strs, change: str,
  doer: en(TASK_DOERS), impact: num, confidence: num, effort: num, priority: num, depends_on: strs, success_check: str, check_after_days: num,
  issue_ids: strs, recurring: bool, site_wide_item: en(SITE_WIDE_ITEMS), page_group: en(PAGE_GROUPS),
});
const monthZ = z.object({
  theme: z.string(), goal: z.string(),
  tasks: z.array(z.object({
    id: z.string(), week: z.number(), title: z.string(), area: z.enum(AUDIT_AREAS), category: z.enum(TASK_CATEGORIES), why: z.string(), urls: z.array(z.string()),
    keywords: z.array(z.string()), change: z.string(), doer: z.enum(TASK_DOERS), impact: z.number(), confidence: z.number(), effort: z.number(), priority: z.number(),
    depends_on: z.array(z.string()), success_check: z.string(), check_after_days: z.number(), issue_ids: z.array(z.string()), recurring: z.boolean(),
    site_wide_item: z.enum(SITE_WIDE_ITEMS), page_group: z.enum(PAGE_GROUPS),
  })),
  later: z.array(z.object({ title: z.string(), reason_deferred: z.string() })),
});
const MONTH_SCHEMA = obj({ theme: str, goal: str, tasks: arr(taskJson), later: arr(obj({ title: str, reason_deferred: str })) });
const overviewZ = z.object({ summary: z.string(), baseline_and_targets: z.array(z.object({ metric: z.string(), now: z.string(), month_3_target: z.string(), month_6_target: z.string() })) });
const OVERVIEW_SCHEMA = obj({ summary: str, baseline_and_targets: arr(obj({ metric: str, now: str, month_3_target: str, month_6_target: str })) });

// ---- Page fix sheet checks ------------------------------------------------------------------

export const TITLE_RANGE = [50, 60] as const;
export const META_RANGE = [140, 155] as const;
const keep = (v: string) => !v.trim() || v.trim().toLowerCase() === 'keep';
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/** Rows whose new title or meta is outside the length rules or used twice (each message says why). */
export function fixProblems(rows: Pick<PlanPageFix, 'url' | 'new_title' | 'new_meta'>[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (url: string, msg: string) => out.set(url, [...(out.get(url) ?? []), msg]);
  const seen = { title: new Map<string, string>(), meta: new Map<string, string>() };
  for (const r of rows) {
    const t = r.new_title.trim();
    const m = r.new_meta.trim();
    if (!keep(t)) {
      if (t.length < TITLE_RANGE[0] || t.length > TITLE_RANGE[1]) add(r.url, `new_title is ${t.length} characters; it must be ${TITLE_RANGE[0]}–${TITLE_RANGE[1]}`);
      const k = t.toLowerCase();
      if (seen.title.has(k)) add(r.url, `new_title is the same as for ${seen.title.get(k)}`);
      else seen.title.set(k, r.url);
    }
    if (!keep(m)) {
      if (m.length < META_RANGE[0] || m.length > META_RANGE[1]) add(r.url, `new_meta is ${m.length} characters; it must be ${META_RANGE[0]}–${META_RANGE[1]}`);
      const k = m.toLowerCase();
      if (seen.meta.has(k)) add(r.url, `new_meta is the same as for ${seen.meta.get(k)}`);
      else seen.meta.set(k, r.url);
    }
  }
  return out;
}

// ---- The pipeline ---------------------------------------------------------------------------

export type PipelineResult = {
  plan: AiPlan;
  analysis: PlanAnalysis;
  pageFixes: PlanPageFix[];
  tokens: number;
  model: string;
  notes: string[];
};
type Deps = {
  client: OpenAiClient;
  input: PlanInput;
  report: ReportModel | null;
  /** The crawl's indexable pages (cleanupPages). */
  pages: CleanupPage[];
  /** Drafted alt text per page URL (Module 2 alt-text drafts), when there are any. */
  altDrafts?: Map<string, { image: string; alt: string }[]>;
  onProgress?: (step: string) => void | Promise<void>;
};

const BATCH = 20;
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

export async function runPlanPipeline(d: Deps): Promise<PipelineResult> {
  const { client, input } = d;
  const b = input.business;
  let tokens = 0;
  let model = '';
  const notes: string[] = [];
  const progress = async (s: string) => void (await d.onProgress?.(s));
  const ask = async <T,>(system: string, user: unknown, name: string, schema: Record<string, unknown>, parse: z.ZodType<T>, maxOutputTokens: number): Promise<T> => {
    const r = await client.generateJson({ system, user: JSON.stringify(user), name, jsonSchema: schema, parse, maxOutputTokens, timeoutMs: 300_000 });
    tokens += r.tokens;
    model = r.model;
    return r.data;
  };

  // Steps 1, 2, 4, 5 + keyword map.
  await progress('Studying the site and auditing it (step 1 of 4)');
  const analysis = await ask(analysisSystem(b), input.data, 'seo_analysis', ANALYSIS_SCHEMA, analysisZ, 24_000);
  const issueIds = new Set<string>();
  analysis.issues = analysis.issues.filter((i) => (issueIds.has(i.issue_id) ? false : (issueIds.add(i.issue_id), true)));

  // Step 3: the page fix sheet, in batches, for every indexable URL.
  await progress(`Writing page fixes for ${d.pages.filter((p) => p.indexable).length} pages (step 2 of 4)`);
  const pageFixes = await writePageFixes(d, analysis, ask, notes);

  // Step 6: one month at a time.
  const months: AiPlan['months'] = [];
  const later: AiPlan['later'] = [];
  const batches = fixBatches(pageFixes, d.pages);
  for (let m = 1; m <= 6; m++) {
    await progress(`Writing month ${m} of 6 (step 3 of 4)`);
    const earlier = months.flatMap((x) => x.tasks.map((t) => ({ id: t.id, month: x.month, title: t.title, area: (t as AiPlanTask).area, issue_ids: (t as AiPlanTask).issue_ids })));
    const r = await ask(monthSystem(b, m), {
      study: analysis.study,
      issues: analysis.issues,
      offpage: analysis.offpage.filter((o) => Math.round(o.month) === m),
      keyword_map: analysis.keyword_map.slice(0, 80),
      fix_batches: m === 1 ? batches : batches.map((x) => ({ item: x.item, page_group: x.page_group, urls: x.urls.length })),
      opportunities: pick(input.data, ['search_console_90_days', 'topics', 'page_plan', 'competitor_gaps', 'content_audit', 'ai_search', 'ai_questions', 'people_also_ask', 'backlinks', 'business_profile']),
      earlier_tasks: earlier,
    }, `month_${m}`, MONTH_SCHEMA, monthZ, 16_000);
    months.push({ month: m, theme: r.theme, goal: r.goal, tasks: r.tasks });
    later.push(...r.later);
  }

  await progress('Writing the summary and targets (step 4 of 4)');
  const overview = await ask(overviewSystem(b), {
    months: months.map((m) => ({ month: m.month, theme: m.theme, goal: m.goal, tasks: m.tasks.length })),
    audit_score: input.data.audit_score ?? null,
    search_console_90_days: Array.isArray(input.data.search_console_90_days) ? (input.data.search_console_90_days as unknown[]).slice(0, 20) : 'not connected',
    keyword_positions: analysis.keyword_map.slice(0, 30),
    business_profile: input.data.business_profile ?? 'not checked',
    backlinks: input.data.backlinks ?? 'not checked',
    ai_search: input.data.ai_search ?? 'not checked',
  }, 'plan_overview', OVERVIEW_SCHEMA, overviewZ, 3_000);

  const plan: AiPlan = {
    summary: overview.summary,
    baseline_and_targets: overview.baseline_and_targets,
    removed_keywords: analysis.removed_keywords,
    page_map: analysis.keyword_map.map((k) => ({
      url: k.url, is_new: !d.pages.some((p) => norm(p.url) === norm(k.url)), page_type: d.pages.find((p) => norm(p.url) === norm(k.url))?.group ?? 'new page',
      main_keyword: k.main_keyword, supporting_keywords: k.supporting_keywords, total_monthly_volume: k.volume ?? 0,
    })),
    months,
    later,
    data_gaps: analysis.data_gaps,
  };
  return { plan, analysis, pageFixes, tokens, model, notes };
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? 'no data']));

/** The fix sheet grouped the way Month 1's clean-up batches are approved: item type × page group. */
export function fixBatches(rows: PlanPageFix[], pages: CleanupPage[]) {
  const group = new Map(pages.map((p) => [norm(p.url), p.group]));
  const items: { item: string; test: (r: PlanPageFix) => boolean }[] = [
    { item: 'canonical', test: (r) => !keep(r.canonical_action) && !/^keep|^none|^no change/i.test(r.canonical_action) },
    { item: 'meta_title', test: (r) => !keep(r.new_title) },
    { item: 'meta_description', test: (r) => !keep(r.new_meta) },
    { item: 'h1', test: (r) => !keep(r.new_h1) },
    { item: 'alt_text', test: (r) => (r.images_missing_alt ?? 0) > 0 || r.alt_fixes.length > 0 },
  ];
  const out: { item: string; page_group: string; urls: string[] }[] = [];
  for (const { item, test } of items) {
    const by = new Map<string, string[]>();
    for (const r of rows.filter(test)) {
      const g = group.get(norm(r.url)) ?? 'other';
      by.set(g, [...(by.get(g) ?? []), r.url]);
    }
    for (const [page_group, urls] of by) out.push({ item, page_group, urls });
  }
  return out;
}

async function writePageFixes(
  d: Deps,
  analysis: PlanAnalysis,
  ask: <T>(system: string, user: unknown, name: string, schema: Record<string, unknown>, parse: z.ZodType<T>, maxOutputTokens: number) => Promise<T>,
  notes: string[],
): Promise<PlanPageFix[]> {
  const b = d.input.business;
  const indexable = d.pages.filter((p) => p.indexable);
  const byUrl = new Map((d.report?.pages ?? []).map((p) => [norm(p.url), p]));
  const mainKw = new Map(analysis.keyword_map.map((k) => [norm(k.url), k.main_keyword]));
  const positions = new Map(analysis.keyword_map.map((k) => [norm(k.url), k.position]));
  const describe = (p: CleanupPage) => {
    const r = byUrl.get(norm(p.url));
    return {
      url: p.url, page_type: r?.pageType ?? p.group, current_title: r?.title ?? null, title_length: r?.title?.length ?? null,
      current_meta: r?.description ?? null, meta_length: r?.description?.length ?? null, current_h1: r?.h1 ?? null, h1_count: r?.h1Count ?? null,
      current_canonical: r?.canonical ?? null, canonical_status: p.canonical, variant_url: p.variant_url, words: r?.words ?? null,
      images_missing_alt: p.images_without_alt, main_keyword: mainKw.get(norm(p.url)) ?? null, best_position: positions.get(norm(p.url)) ?? null,
    };
  };
  const context = { study: analysis.study, keyword_map: analysis.keyword_map.slice(0, 80), issues: analysis.issues.filter((i) => 'BCDEFK'.includes(i.area)) };
  const batches: CleanupPage[][] = [];
  for (let i = 0; i < indexable.length; i += BATCH) batches.push(indexable.slice(i, i + BATCH));
  const results = await pool(batches, 4, async (batch) => {
    try {
      return (await ask(fixesSystem(b), { ...context, pages: batch.map(describe) }, 'page_fixes', FIXES_SCHEMA, fixesZ, 12_000)).rows;
    } catch (err) {
      notes.push(`Page fixes for ${batch.length} pages could not be written: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  });
  const model = new Map(results.flat().map((r) => [norm(r.url), r]));

  const build = (p: CleanupPage): PlanPageFix => {
    const r = byUrl.get(norm(p.url));
    const m = model.get(norm(p.url));
    return {
      url: p.url, main_keyword: m?.main_keyword ?? mainKw.get(norm(p.url)) ?? '', new_title: m?.new_title ?? 'keep', new_meta: m?.new_meta ?? 'keep',
      new_h1: m?.new_h1 ?? 'keep', h1_fix: m?.h1_fix ?? '', correct_canonical: m?.correct_canonical ?? r?.canonical ?? p.url, canonical_action: m?.canonical_action ?? 'keep',
      other_fixes: m?.other_fixes ?? [], priority: m?.priority ?? 'Medium',
      page_type: r?.pageType ?? p.group, current_title: r?.title ?? null, title_length: r?.title?.length ?? null, current_meta: r?.description ?? null,
      meta_length: r?.description?.length ?? null, current_h1s: r?.h1 ? `${r.h1}${(r.h1Count ?? 1) > 1 ? ` (+${(r.h1Count ?? 1) - 1} more)` : ''}` : '', current_canonical: r?.canonical ?? null,
      images_total: r?.images ?? null, images_missing_alt: p.images_without_alt,
      alt_fixes: (d.altDrafts?.get(norm(p.url)) ?? []).map((a) => ({ ...a, verify: false })),
      ...(m ? {} : { note: 'Not reviewed by AI: kept as it is' }),
    };
  };
  let rows = indexable.map(build);
  if (rows.some((r) => r.note)) notes.push(`${rows.filter((r) => r.note).length} page(s) have no AI fixes and were kept as they are.`);

  // Lengths and duplicates are recounted; rows that break a rule go back once, then fall back to "keep".
  const problems = fixProblems(rows);
  if (problems.size) {
    const again = rows.filter((r) => problems.has(r.url));
    try {
      const redo = (await ask(fixesSystem(b), {
        ...context,
        pages: again.map((r) => ({ ...describe(indexable.find((p) => norm(p.url) === norm(r.url))!), your_previous_answer: { new_title: r.new_title, new_meta: r.new_meta }, problems: problems.get(r.url) })),
        taken: { titles: rows.filter((r) => !problems.has(r.url)).map((r) => r.new_title), metas: rows.filter((r) => !problems.has(r.url)).map((r) => r.new_meta) },
      }, 'page_fixes_retry', FIXES_SCHEMA, fixesZ, 8_000)).rows;
      const fixed = new Map(redo.map((r) => [norm(r.url), r]));
      rows = rows.map((r) => (fixed.has(norm(r.url)) ? { ...r, new_title: fixed.get(norm(r.url))!.new_title, new_meta: fixed.get(norm(r.url))!.new_meta } : r));
    } catch {
      // fall through to "keep" below
    }
    const still = fixProblems(rows);
    rows = rows.map((r) => {
      const p = still.get(r.url);
      if (!p) return r;
      const titleBad = p.some((x) => x.startsWith('new_title'));
      const metaBad = p.some((x) => x.startsWith('new_meta'));
      return { ...r, ...(titleBad ? { new_title: 'keep' } : {}), ...(metaBad ? { new_meta: 'keep' } : {}), note: `Kept: ${p.join('; ')}` };
    });
    if (still.size) notes.push(`${still.size} page(s) kept their title or description because the AI's version broke a length or duplicate rule twice.`);
  }
  return rows;
}
