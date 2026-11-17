import { z } from 'zod';
import type { DfsConfig, Locale } from './dataforseo-competitors';
import { HttpError, requestJson } from './http';

/**
 * DataForSEO endpoints for Module 6 (deep competitor analysis). Checked against
 * docs.dataforseo.com on 2026-11-17 (one task per Live call, up to 30 at once):
 *  - SERP google/organic/live/advanced: organic results + local pack (`cid`, `rating`) for the ranking grid
 *  - Business Data google/my_business_info/live: category, photos, claimed (≈ $0.0054 per profile);
 *    `keyword` takes "cid:<id>"
 *  - AI Optimization chat_gpt/llm_responses/live: `user_prompt` (≤ 500 chars), `model_name`,
 *    `web_search`, `web_search_country_iso_code`, `max_output_tokens`; answer in
 *    result[0].items[type=message].sections[].text with `annotations` (url, title) as citations.
 *    Cost = base + the model's tokens (sample ≈ $0.03).
 */
export const ANALYSIS_LLM_MODEL = 'gpt-4.1-mini';

const num = z.number().nullable().optional();
const str = z.string().nullable().optional();
const rating = z.object({ value: num, votes_count: num }).partial().passthrough().nullable().optional();

const serpItem = z
  .object({ type: z.string(), rank_group: num, domain: str, title: str, url: str, is_paid: z.boolean().nullable().optional(), rating, cid: str })
  .passthrough();
const businessItem = z
  .object({
    title: str,
    category: str,
    additional_categories: z.array(z.string()).nullable().optional(),
    rating,
    total_photos: num,
    is_claimed: z.boolean().nullable().optional(),
    phone: str,
    address: str,
    domain: str,
  })
  .passthrough();
const section = z.object({ type: str, text: str, annotations: z.array(z.object({ url: str, title: str }).passthrough()).nullable().optional() }).passthrough();
const llmItem = z.object({ type: z.string(), sections: z.array(section).nullable().optional() }).passthrough();

const envelope = (items: z.ZodTypeAny) =>
  z.object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().optional(),
    tasks: z
      .array(z.object({ status_code: z.number(), status_message: z.string(), result: z.array(z.object({ items: z.array(items).nullable().optional() }).passthrough()).nullable().optional() }).passthrough())
      .default([]),
  });

export type GridEntry = { kind: 'organic' | 'local'; domain: string; url: string | null; title: string | null; position: number | null; rating: number | null; reviews: number | null; cid: string | null };
export type BusinessInfo = { title: string | null; category: string | null; categories: string[]; rating: number | null; reviews: number | null; photos: number | null; claimed: boolean | null };
export type ChatAnswer = { text: string; citations: { url: string; title: string | null }[] };

/** ISO country codes for ChatGPT's web search, by the workspace country name. */
export const COUNTRY_ISO: Record<string, string> = {
  'United States': 'US', 'United Kingdom': 'GB', Canada: 'CA', Australia: 'AU', Pakistan: 'PK', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA',
  Qatar: 'QA', India: 'IN', Ireland: 'IE', 'New Zealand': 'NZ', 'South Africa': 'ZA', Germany: 'DE',
};

export function createAnalysisClient(cfg: DfsConfig) {
  const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
  const base = cfg.baseUrl.replace(/\/$/, '');

  async function live<T extends z.ZodTypeAny>(path: string, items: T, task: Record<string, unknown>, timeoutMs = 60_000): Promise<{ items: z.infer<T>[]; cost: number }> {
    const json = await requestJson<unknown>(`${base}${path}`, { provider: 'dataforseo', method: 'POST', headers: { authorization: auth }, body: [task], timeoutMs, retries: 0, log: cfg.log });
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
    /** Page 1 for one search: organic results and the map pack, with ratings and Business Profile ids. */
    async serp(keyword: string, l: Locale): Promise<{ entries: GridEntry[]; cost: number }> {
      const { items, cost } = await live('/v3/serp/google/organic/live/advanced', serpItem, { keyword, ...where(l), depth: 10, device: 'desktop', resolve_goto_urls: true });
      const entries = items.flatMap((i): GridEntry[] => {
        if (!i.domain || i.is_paid) return [];
        if (i.type !== 'organic' && i.type !== 'local_pack') return [];
        return [{
          kind: i.type === 'organic' ? 'organic' : 'local', domain: i.domain, url: i.url ?? null, title: i.title ?? null, position: i.rank_group ?? null,
          rating: i.rating?.value ?? null, reviews: i.rating?.votes_count ?? null, cid: i.cid ?? null,
        }];
      });
      return { entries, cost };
    },

    /** Google Business Profile details for one business (by its cid, or its name). */
    async businessInfo(keyword: string, l: Locale): Promise<{ info: BusinessInfo | null; cost: number }> {
      const { items, cost } = await live('/v3/business_data/google/my_business_info/live', businessItem, { keyword: keyword.slice(0, 700), ...where(l) });
      const i = items[0];
      return {
        cost,
        info: i
          ? { title: i.title ?? null, category: i.category ?? null, categories: (i.additional_categories ?? []).slice(0, 8), rating: i.rating?.value ?? null, reviews: i.rating?.votes_count ?? null, photos: i.total_photos ?? null, claimed: i.is_claimed ?? null }
          : null,
      };
    },

    /** One question asked in ChatGPT with web search, as a customer would. */
    async chatGpt(prompt: string, countryIso: string | undefined): Promise<{ answer: ChatAnswer; cost: number }> {
      const { items, cost } = await live(
        '/v3/ai_optimization/chat_gpt/llm_responses/live',
        llmItem,
        { user_prompt: prompt.slice(0, 500), model_name: ANALYSIS_LLM_MODEL, max_output_tokens: 1024, web_search: true, ...(countryIso ? { web_search_country_iso_code: countryIso } : {}) },
        120_000,
      );
      const sections = items.filter((i) => i.type === 'message').flatMap((i) => i.sections ?? []);
      const citations = sections.flatMap((s) => s.annotations ?? []).flatMap((a) => (a.url ? [{ url: a.url, title: a.title ?? null }] : []));
      const seen = new Set<string>();
      return {
        cost,
        answer: {
          text: sections.map((s) => s.text ?? '').join('\n').trim().slice(0, 6000),
          citations: citations.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 20),
        },
      };
    },
  };
}

export type AnalysisClient = ReturnType<typeof createAnalysisClient>;
