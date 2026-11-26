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
/** Organic SERP item; "people_also_ask" items hold questions in items[].title (type people_also_ask_element). */
const serpItem = z
  .object({ type: z.string(), url: str, domain: str, rank_group: num, items: z.array(z.object({ type: str, title: str }).passthrough()).nullable().optional() })
  .passthrough();
/** domain_intersection with intersections: true carries both domains' SERP elements (docs checked 2026-11-19). */
const sharedItem = z
  .object({
    keyword_data: keywordData,
    first_domain_serp_element: z.object({ rank_group: num }).passthrough().nullable().optional(),
    second_domain_serp_element: z.object({ rank_group: num }).passthrough().nullable().optional(),
  })
  .passthrough();
/** domain_intersection item: the same keyword_data as ranked_keywords, plus target1's SERP element. */
const gapItem = z
  .object({ keyword_data: keywordData, first_domain_serp_element: z.object({ rank_group: num, url: str }).passthrough().nullable().optional() })
  .passthrough();

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

  async function live<T extends z.ZodTypeAny>(path: string, items: T, task: Record<string, unknown>, opts: { timeoutMs?: number; retries?: number } = {}): Promise<{ items: z.infer<T>[]; cost: number; result?: Record<string, unknown> }> {
    const json = await requestJson<unknown>(`${base}${path}`, { provider: 'dataforseo', method: 'POST', headers: { authorization: auth }, body: [task], timeoutMs: opts.timeoutMs ?? 60_000, retries: opts.retries, log: cfg.log });
    const parsed = envelope(items).parse(json);
    if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
    const t = parsed.tasks[0];
    if (!t) throw new HttpError('DataForSEO returned no task', 0);
    if (t.status_code === 40102) return { items: [], cost: parsed.cost ?? 0 };
    if (t.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
    return { items: (t.result?.[0]?.items ?? []) as z.infer<T>[], cost: parsed.cost ?? 0, result: t.result?.[0] as Record<string, unknown> | undefined };
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

    /**
     * Page 1 for a keyword (advanced endpoint, same $0.002 as regular): top 10 organic URLs for
     * clustering, "People also ask" questions, and which SERP features show (local pack, video…).
     * Short timeout: clustering works without a slow one.
     */
    async serpUrls(keyword: string, l: Locale, timeoutMs = 30_000): Promise<{ urls: string[]; questions: string[]; features: string[]; cost: number }> {
      const { items, cost, result } = await live('/v3/serp/google/organic/live/advanced', serpItem, { keyword, ...where(l), depth: 10, device: 'desktop', resolve_goto_urls: true }, { timeoutMs, retries: 0 });
      const types = Array.isArray(result?.item_types) ? (result.item_types as unknown[]).filter((t): t is string => typeof t === 'string') : [...new Set(items.map((i) => i.type))];
      return {
        cost,
        urls: items.filter((i) => i.type === 'organic' && i.url).map((i) => i.url!).slice(0, 10),
        questions: [...new Set(items.filter((i) => i.type === 'people_also_ask').flatMap((i) => (i.items ?? []).map((q) => q.title?.trim() ?? '')).filter(Boolean))].slice(0, 8),
        features: types.filter((t) => t !== 'organic').slice(0, 12),
      };
    },

    /** 4.2 Keyword gap: keywords the competitor ranks for and the site does not (Labs domain_intersection, intersections: false). */
    async keywordGap(competitor: string, own: string, l: Locale, limit = 150): Promise<{ keywords: RankedKeyword[]; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/domain_intersection/live', gapItem, {
        target1: competitor, target2: own, intersections: false, ...where(l), item_types: ['organic'], limit, order_by: ['keyword_data.keyword_info.search_volume,desc'],
      });
      return {
        cost,
        // position/url are the competitor's, kept only to say where they rank.
        keywords: items.map((i) => ({ ...metrics(i.keyword_data), position: i.first_domain_serp_element?.rank_group ?? null, url: i.first_domain_serp_element?.url ?? null })),
      };
    },
    /** 6.1.5 Searches both domains rank for, with each one's position (Labs domain_intersection, intersections: true). */
    async sharedKeywords(own: string, rival: string, l: Locale, limit = 200): Promise<{ rows: { term: string; volume: number | null; own: number | null; rival: number | null }[]; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/domain_intersection/live', sharedItem, {
        target1: own, target2: rival, intersections: true, ...where(l), item_types: ['organic'], limit, order_by: ['keyword_data.keyword_info.search_volume,desc'],
      });
      return {
        cost,
        rows: items.map((i) => ({ term: metrics(i.keyword_data).term, volume: metrics(i.keyword_data).volume, own: i.first_domain_serp_element?.rank_group ?? null, rival: i.second_domain_serp_element?.rank_group ?? null })),
      };
    },
  };
}

export type KeywordClient = ReturnType<typeof createKeywordClient>;

/**
 * Local search volume (Google Ads Keywords Data), docs checked 2026-11-26:
 *  - GET  /v3/keywords_data/google_ads/locations/$country → result[] { location_code, location_name
 *    ("Leeds,England,United Kingdom"), location_code_parent, country_iso_code, location_type }
 *  - POST /v3/keywords_data/google_ads/search_volume/live → one task, up to 1,000 keywords (80 characters,
 *    10 words each), billed per task ($0.09 live, whatever the number of keywords); result[] is the list of
 *    keywords { keyword, search_volume, cpc, competition, monthly_searches } (search_volume null without data).
 * Live endpoints allow 12 requests a minute per account, so callers keep to one or two places per run.
 */
const adsLocation = z.object({ location_code: z.number(), location_name: z.string(), location_type: str, country_iso_code: str }).passthrough();
const adsVolume = z.object({ keyword: z.string(), search_volume: num, cpc: num }).passthrough();
const adsEnvelope = (item: z.ZodTypeAny) =>
  z.object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().optional(),
    tasks: z.array(z.object({ status_code: z.number(), status_message: z.string(), result: z.array(item).nullable().optional() }).passthrough()).default([]),
  });
export type AdsLocation = { code: number; name: string; type: string | null };

const locationCache = new Map<string, { at: number; list: AdsLocation[] }>();
/** Place types searched in this order: a city first, then larger areas. */
const PLACE_TYPES = ['City', 'Municipality', 'Neighborhood', 'District', 'County', 'Region', 'Province', 'State', 'Borough'];

/** Picks the Google Ads location for a place typed in the research inputs ("Leeds" → "Leeds,England,United Kingdom"). */
export function matchAdsLocation(list: AdsLocation[], place: string): AdsLocation | null {
  const want = place.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!want) return null;
  const head = (l: AdsLocation) => l.name.split(',')[0]!.trim().toLowerCase();
  const exact = list.filter((l) => head(l) === want || l.name.toLowerCase() === want);
  const rank = (l: AdsLocation) => {
    const i = PLACE_TYPES.indexOf(l.type ?? '');
    return i < 0 ? PLACE_TYPES.length : i;
  };
  return exact.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)[0] ?? null;
}

export function createLocalVolumeClient(cfg: DfsConfig) {
  const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
  const base = cfg.baseUrl.replace(/\/$/, '');
  return {
    /** Google Ads locations of one country (cached for a day per server). */
    async locations(countryIso: string): Promise<AdsLocation[]> {
      const key = countryIso.toLowerCase();
      const hit = locationCache.get(key);
      if (hit && Date.now() - hit.at < 86_400_000) return hit.list;
      const json = await requestJson<unknown>(`${base}/v3/keywords_data/google_ads/locations/${encodeURIComponent(key)}`, { provider: 'dataforseo', method: 'GET', headers: { authorization: auth }, timeoutMs: 60_000, retries: 1, log: cfg.log });
      const parsed = adsEnvelope(adsLocation).parse(json);
      if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
      const list = (parsed.tasks[0]?.result ?? []).map((l) => ({ code: l.location_code as number, name: l.location_name as string, type: (l.location_type as string | null) ?? null }));
      locationCache.set(key, { at: Date.now(), list });
      return list;
    },
    /** Monthly searches and ad price in one place for up to 1,000 keywords (one paid task). */
    async volume(keywords: string[], locationName: string, language: string): Promise<{ rows: { term: string; volume: number | null; cpc: number | null }[]; cost: number }> {
      const list = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(validKeyword))].slice(0, 1000);
      if (!list.length) return { rows: [], cost: 0 };
      const json = await requestJson<unknown>(`${base}/v3/keywords_data/google_ads/search_volume/live`, { provider: 'dataforseo', method: 'POST', headers: { authorization: auth }, body: [{ keywords: list, location_name: locationName, language_code: language }], timeoutMs: 90_000, retries: 0, log: cfg.log });
      const parsed = adsEnvelope(adsVolume).parse(json);
      if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
      const t = parsed.tasks[0];
      if (!t) throw new HttpError('DataForSEO returned no task', 0);
      if (t.status_code >= 40000 && t.status_code !== 40102) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
      return {
        cost: parsed.cost ?? 0,
        rows: (t.result ?? []).map((r) => ({ term: String(r.keyword).toLowerCase(), volume: (r.search_volume as number | null | undefined) ?? null, cpc: (r.cpc as number | null | undefined) ?? null })),
      };
    },
  };
}
export type LocalVolumeClient = ReturnType<typeof createLocalVolumeClient>;

/**
 * Account balance (free call). The per-call `cost` DataForSEO reports for Labs live calls has been
 * well below what is charged (live test 2026-11-17: $0.054 reported, $0.24 charged), so paid runs
 * record the balance difference when it is larger.
 */
export async function dataforseoBalance(cfg: DfsConfig): Promise<number | null> {
  try {
    const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
    const json = await requestJson<unknown>(`${cfg.baseUrl.replace(/\/$/, '')}/v3/appendix/user_data`, { provider: 'dataforseo-account', method: 'GET', headers: { authorization: auth }, timeoutMs: 10_000, retries: 0 });
    const balance = z.object({ tasks: z.array(z.object({ result: z.array(z.object({ money: z.object({ balance: z.number() }).passthrough() }).passthrough()).nullable().optional() }).passthrough()) }).parse(json).tasks[0]?.result?.[0]?.money.balance;
    return typeof balance === 'number' ? balance : null;
  } catch {
    return null;
  }
}
