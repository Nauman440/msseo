import { z } from 'zod';
import { HttpError, requestJson } from './http';
import type { DfsConfig, Locale } from './dataforseo-competitors';

export type { Locale };

/**
 * DataForSEO endpoints for Module 4 (keyword research). Checked against docs.dataforseo.com
 * on 2026-11-17; one task per Live call; field names verified against real responses.
 *  - Labs ranked_keywords/live:        keywords a domain ranks for (+ position and URL)
 *  - Labs keyword_overview/live:       metrics for up to 700 keywords per call
 *  - Labs keyword_suggestions/live:    long-tail keywords containing a seed
 *  - SERP google/autocomplete/live/advanced: what Google suggests while typing
 *  - SERP google/organic/live/regular: top 10 URLs per keyword, for SERP-overlap clustering
 *    (resolve_goto_urls: true, otherwise every URL is a google.com/goto link)
 */
const num = z.number().nullable().optional();
const str = z.string().nullable().optional();

const keywordInfo = z
  .object({
    search_volume: num,
    cpc: num,
    competition: num,
    monthly_searches: z.array(z.object({ year: z.number(), month: z.number(), search_volume: num }).passthrough()).nullable().optional(),
  })
  .partial()
  .passthrough()
  .nullable()
  .optional();
const keywordProps = z.object({ keyword_difficulty: num }).partial().passthrough().nullable().optional();
const intentInfo = z.object({ main_intent: str }).partial().passthrough().nullable().optional();

/** keyword_overview / keyword_suggestions item; ranked_keywords nests the same under keyword_data. */
const keywordData = z
  .object({ keyword: z.string(), keyword_info: keywordInfo, keyword_properties: keywordProps, search_intent_info: intentInfo })
  .passthrough();

const rankedItem = z
  .object({
    keyword_data: keywordData,
    ranked_serp_element: z
      .object({
        serp_item: z
          .object({ type: str, rank_group: num, url: str, relative_url: str })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const autocompleteItem = z.object({ type: z.string(), suggestion: str }).passthrough();
const organicItem = z.object({ type: z.string(), url: str, domain: str, rank_group: num }).passthrough();

const envelope = (items: z.ZodTypeAny) =>
  z.object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().optional(),
    tasks: z
      .array(
        z
          .object({
            status_code: z.number(),
            status_message: z.string(),
            result: z.array(z.object({ items: z.array(items).nullable().optional() }).passthrough()).nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  });

export type KeywordIntent = 'informational' | 'navigational' | 'commercial' | 'transactional';
export type KeywordMetrics = {
  term: string;
  volume: number | null;
  /** Monthly volume, oldest first (up to 12 months). */
  trend: number[] | null;
  /** Month of trend[0], "YYYY-MM". */
  trendFrom: string | null;
  difficulty: number | null;
  cpc: number | null;
  intent: KeywordIntent | null;
};
export type RankedKeyword = KeywordMetrics & { position: number | null; url: string | null };

const INTENTS = new Set(['informational', 'navigational', 'commercial', 'transactional']);

function metrics(d: z.infer<typeof keywordData>): KeywordMetrics {
  const months = (d.keyword_info?.monthly_searches ?? [])
    .map((m) => ({ year: m.year, month: m.month, v: m.search_volume ?? 0 }))
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .slice(-12);
  const intent = d.search_intent_info?.main_intent ?? null;
  return {
    term: d.keyword.toLowerCase(),
    volume: d.keyword_info?.search_volume ?? null,
    trend: months.length ? months.map((m) => m.v) : null,
    trendFrom: months[0] ? `${months[0].year}-${String(months[0].month).padStart(2, '0')}` : null,
    difficulty: d.keyword_properties?.keyword_difficulty ?? null,
    cpc: d.keyword_info?.cpc ?? null,
    intent: intent && INTENTS.has(intent) ? (intent as KeywordIntent) : null,
  };
}

/** DataForSEO rejects keywords over 80 characters or 10 words. */
export const validKeyword = (k: string) => k.length > 0 && k.length <= 80 && k.split(/\s+/).length <= 10;

export function createKeywordClient(cfg: DfsConfig) {
  const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
  const base = cfg.baseUrl.replace(/\/$/, '');

  async function live<T extends z.ZodTypeAny>(path: string, items: T, task: Record<string, unknown>): Promise<{ items: z.infer<T>[]; cost: number }> {
    const json = await requestJson<unknown>(`${base}${path}`, { provider: 'dataforseo', method: 'POST', headers: { authorization: auth }, body: [task], timeoutMs: 60_000, log: cfg.log });
    const parsed = envelope(items).parse(json);
    if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
    const t = parsed.tasks[0];
    if (!t) throw new HttpError('DataForSEO returned no task', 0);
    if (t.status_code === 40102) return { items: [], cost: parsed.cost ?? 0 };
    if (t.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
    return { items: (t.result?.[0]?.items ?? []) as z.infer<T>[], cost: parsed.cost ?? 0 };
  }

  const where = (l: Locale) => ({ location_name: l.country, language_code: l.language });

  return {
    /** Organic keywords a domain ranks for, most searched first. */
    async rankedKeywords(target: string, l: Locale, limit = 300): Promise<{ keywords: RankedKeyword[]; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/ranked_keywords/live', rankedItem, {
        target, ...where(l), item_types: ['organic'], limit, order_by: ['keyword_data.keyword_info.search_volume,desc'],
      });
      return {
        cost,
        keywords: items.map((i) => ({
          ...metrics(i.keyword_data),
          position: i.ranked_serp_element?.serp_item?.rank_group ?? null,
          url: i.ranked_serp_element?.serp_item?.url ?? null,
        })),
      };
    },

    /** Volume, 12-month trend, difficulty, CPC and intent for up to 700 keywords. */
    async overview(keywords: string[], l: Locale): Promise<{ keywords: KeywordMetrics[]; cost: number }> {
      const list = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(validKeyword))].slice(0, 700);
      if (!list.length) return { keywords: [], cost: 0 };
      const { items, cost } = await live('/v3/dataforseo_labs/google/keyword_overview/live', keywordData, { keywords: list, ...where(l) });
      return { cost, keywords: items.map(metrics) };
    },

    /** Long-tail keywords that contain the seed. */
    async suggestions(keyword: string, l: Locale, limit = 100): Promise<{ keywords: KeywordMetrics[]; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/keyword_suggestions/live', keywordData, { keyword: keyword.toLowerCase(), ...where(l), limit, include_seed_keyword: true });
      return { cost, keywords: items.map(metrics) };
    },

    /** Google autocomplete suggestions for a partial search. */
    async autocomplete(keyword: string, l: Locale): Promise<{ suggestions: string[]; cost: number }> {
      const { items, cost } = await live('/v3/serp/google/autocomplete/live/advanced', autocompleteItem, { keyword, ...where(l) });
      return { cost, suggestions: items.filter((i) => i.type === 'autocomplete' && i.suggestion).map((i) => i.suggestion!.toLowerCase()) };
    },

    /** Top 10 organic URLs for a keyword. */
    async serpUrls(keyword: string, l: Locale): Promise<{ urls: string[]; cost: number }> {
      const { items, cost } = await live('/v3/serp/google/organic/live/regular', organicItem, { keyword, ...where(l), depth: 10, device: 'desktop', resolve_goto_urls: true });
      return { cost, urls: items.filter((i) => i.type === 'organic' && i.url).map((i) => i.url!).slice(0, 10) };
    },
  };
}

export type KeywordClient = ReturnType<typeof createKeywordClient>;
