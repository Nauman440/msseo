import { z } from 'zod';
import { HttpError, requestJson, type HttpLog } from './http';

/**
 * DataForSEO endpoints for Module 3 (competitor identification). Checked against
 * docs.dataforseo.com on 2026-11-17: every Live call carries exactly one task; up to 30
 * simultaneous calls. Field names verified against real responses (see test fixtures).
 *  - Labs competitors_domain/live:        domains sharing the target's organic keywords
 *  - Labs domain_rank_overview/live:      estimated traffic (etv) and ranking keywords
 *  - Labs historical_rank_overview/live:  monthly etv/count (≈ $0.10/call: shortlist only)
 *  - SERP google/organic/live/advanced:   top results + local pack for a core search
 *    (resolve_goto_urls: true, otherwise every domain comes back as google.com; same $0.002)
 */
export type DfsConfig = { login: string; password: string; baseUrl: string; log?: HttpLog };
export type Locale = { country: string; language: string };

const num = z.number().nullable().optional();
const organic = z.object({ etv: num, count: num, pos_1: num, pos_2_3: num, pos_4_10: num }).partial().passthrough().nullable().optional();

const competitorItem = z
  .object({
    domain: z.string(),
    avg_position: num,
    intersections: num,
    full_domain_metrics: z.object({ organic }).partial().passthrough().nullable().optional(),
  })
  .passthrough();

const rankItem = z.object({ metrics: z.object({ organic }).partial().passthrough().nullable().optional() }).passthrough();
const historyItem = z.object({ year: z.number(), month: z.number(), metrics: z.object({ organic }).partial().passthrough().nullable().optional() }).passthrough();

const serpItem = z
  .object({
    type: z.string(),
    rank_group: num,
    rank_absolute: num,
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    is_paid: z.boolean().nullable().optional(),
    rating: z.object({ value: num, votes_count: num }).partial().passthrough().nullable().optional(),
  })
  .passthrough();

const envelope = (items: z.ZodTypeAny) =>
  z.object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().optional(),
    tasks: z
      .array(
        z.object({
          status_code: z.number(),
          status_message: z.string(),
          result: z.array(z.object({ items: z.array(items).nullable().optional() }).passthrough()).nullable().optional(),
        }).passthrough(),
      )
      .default([]),
  });

export type CompetitorDomain = { domain: string; avgPosition: number | null; intersections: number | null; etv: number | null; keywords: number | null };
export type SerpEntry = { kind: 'organic' | 'local'; domain: string; title: string | null; position: number | null; /** Map listing stars and review count (local pack only). */ rating?: number | null; reviews?: number | null };
export type RankOverview = { etv: number | null; keywords: number | null; top3: number | null; top10?: number | null };
export type MonthPoint = { month: string; etv: number };

export function createCompetitorClient(cfg: DfsConfig) {
  const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
  const base = cfg.baseUrl.replace(/\/$/, '');

  async function live<T extends z.ZodTypeAny>(path: string, items: T, task: Record<string, unknown>): Promise<{ items: z.infer<T>[]; cost: number }> {
    const json = await requestJson<unknown>(`${base}${path}`, { provider: 'dataforseo', method: 'POST', headers: { authorization: auth }, body: [task], timeoutMs: 60_000, log: cfg.log });
    const parsed = envelope(items).parse(json);
    if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
    const t = parsed.tasks[0];
    if (!t) throw new HttpError('DataForSEO returned no task', 0);
    // 40102 "No Search Results": a valid answer with nothing in it.
    if (t.status_code === 40102) return { items: [], cost: parsed.cost ?? 0 };
    if (t.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
    return { items: (t.result?.[0]?.items ?? []) as z.infer<T>[], cost: parsed.cost ?? 0 };
  }

  const where = (l: Locale) => ({ location_name: l.country, language_code: l.language });

  return {
    /** Domains that rank for the same organic keywords as the target (top `limit` by shared keywords). */
    async competitorsDomain(target: string, l: Locale, limit = 30): Promise<{ domains: CompetitorDomain[]; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/competitors_domain/live', competitorItem, {
        target, ...where(l), item_types: ['organic'], exclude_top_domains: true, limit, order_by: ['intersections,desc'],
      });
      return {
        cost,
        domains: items.map((i) => ({
          domain: i.domain,
          avgPosition: i.avg_position ?? null,
          intersections: i.intersections ?? null,
          etv: i.full_domain_metrics?.organic?.etv ?? null,
          keywords: i.full_domain_metrics?.organic?.count ?? null,
        })),
      };
    },

    async rankOverview(target: string, l: Locale): Promise<{ overview: RankOverview; cost: number }> {
      const { items, cost } = await live('/v3/dataforseo_labs/google/domain_rank_overview/live', rankItem, { target, ...where(l) });
      const o = items[0]?.metrics?.organic;
      return { cost, overview: { etv: o?.etv ?? null, keywords: o?.count ?? null, top3: o ? (o.pos_1 ?? 0) + (o.pos_2_3 ?? 0) : null, top10: o ? (o.pos_1 ?? 0) + (o.pos_2_3 ?? 0) + (o.pos_4_10 ?? 0) : null } };
    },

    /** Last 12 months of estimated organic traffic (oldest first). */
    async history(target: string, l: Locale, now = new Date()): Promise<{ months: MonthPoint[]; cost: number }> {
      const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const { items, cost } = await live('/v3/dataforseo_labs/google/historical_rank_overview/live', historyItem, { target, ...where(l), date_from: from, correlate: true });
      const months = items
        .map((i) => ({ month: `${i.year}-${String(i.month).padStart(2, '0')}`, etv: Math.round(i.metrics?.organic?.etv ?? 0) }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12);
      return { months, cost };
    },

    /** Organic results and local-pack businesses for one search (first page). */
    async serp(keyword: string, l: Locale): Promise<{ entries: SerpEntry[]; cost: number }> {
      const { items, cost } = await live('/v3/serp/google/organic/live/advanced', serpItem, { keyword, ...where(l), depth: 10, device: 'desktop', resolve_goto_urls: true });
      const entries = items.flatMap((i): SerpEntry[] => {
        if (!i.domain) return [];
        if (i.type === 'organic') return [{ kind: 'organic', domain: i.domain, title: i.title ?? null, position: i.rank_group ?? null }];
        if (i.type === 'local_pack' && !i.is_paid) return [{ kind: 'local', domain: i.domain, title: i.title ?? null, position: i.rank_group ?? null, rating: i.rating?.value ?? null, reviews: i.rating?.votes_count ?? null }];
        return [];
      });
      return { entries, cost };
    },
  };
}

export type CompetitorClient = ReturnType<typeof createCompetitorClient>;
