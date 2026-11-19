import { z } from 'zod';
import { createDfsBase } from './dataforseo-base';
import type { DfsConfig, Locale } from './dataforseo-competitors';

/**
 * DataForSEO for Module 9 (docs.dataforseo.com, checked 2026-11-19):
 *  - serp/google/maps/live/advanced: `location_coordinate` "lat,lng,zoom" (e.g. "32.77,-96.79,13z"),
 *    items `maps_search` with title, domain, cid, rank_group, rating {value, votes_count}, category
 *  - business_data/google/my_business_info/live (keyword "cid:<id>"): categories, description,
 *    phone, address_info, url/domain, total_photos, is_claimed, attributes, work_time, latitude/longitude
 *  - business_data/google/reviews task_post → task_get/$id (depth, sort_by newest): items with
 *    rating.value, timestamp, owner_answer; result reviews_count, rating
 *  - business_data/google/my_business_updates task_post → task_get/$id: posts with timestamp
 *  - business_data/google/questions_and_answers/live: items (answered) + items_without_answers
 *  - serp/google/organic/live/advanced (depth 100): where the business is listed (citations)
 */
const num = z.number().nullable().optional();
const str = z.string().nullable().optional();
const rating = z.object({ value: num, votes_count: num }).partial().passthrough().nullable().optional();

const mapsItem = z.object({ type: z.string().optional(), title: str, domain: str, url: str, cid: str, rank_group: num, rating, category: str, address: str, phone: str, latitude: num, longitude: num }).passthrough();
const infoItem = z.object({
  title: str, description: str, category: str, additional_categories: z.array(z.string()).nullable().optional(), cid: str, place_id: str, address: str,
  address_info: z.object({ city: str, zip: str, region: str, country_code: str, address: str }).passthrough().nullable().optional(),
  phone: str, url: str, domain: str, logo: str, main_image: str, total_photos: num, latitude: num, longitude: num, is_claimed: z.boolean().nullable().optional(),
  attributes: z.object({ available_attributes: z.record(z.string(), z.array(z.string())).nullable().optional() }).passthrough().nullable().optional(),
  work_time: z.object({ work_hours: z.object({ timetable: z.record(z.string(), z.unknown()).nullable().optional() }).passthrough().nullable().optional() }).passthrough().nullable().optional(),
  rating,
}).passthrough();
const reviewItem = z.object({ rating, timestamp: str, owner_answer: str, review_text: str }).passthrough();
const postItem = z.object({ timestamp: str, post_text: str }).passthrough();
const qaItem = z.object({ question_text: str, timestamp: str }).passthrough();
const organicItem = z.object({ type: z.string(), domain: str, url: str, title: str, description: str, rank_group: num }).passthrough();

export type MapsResult = { title: string; domain: string | null; cid: string | null; position: number; rating: number | null; reviews: number | null; category: string | null; address: string | null; phone: string | null; lat: number | null; lng: number | null };
export type Profile = {
  title: string; cid: string | null; placeId: string | null; category: string | null; extraCategories: string[]; description: string | null; phone: string | null; address: string | null; city: string | null;
  zip: string | null; website: string | null; domain: string | null; photos: number | null; claimed: boolean | null; attributes: number; hours: boolean; logo: boolean; lat: number | null; lng: number | null;
  rating: number | null; reviews: number | null;
};
export type Review = { rating: number | null; date: string | null; answered: boolean };
export type ListingHit = { domain: string; url: string; title: string | null; snippet: string | null };

export function createLocalClient(cfg: DfsConfig) {
  const dfs = createDfsBase(cfg, 'Business Data');
  const lang = (l: Locale) => ({ language_code: l.language });
  return {
    /** Google Maps results for a search, from a point (grid) or the whole country. */
    async maps(keyword: string, l: Locale, at?: { lat: number; lng: number; zoom: number }, depth = 20): Promise<{ results: MapsResult[]; cost: number }> {
      const where = at ? { location_coordinate: `${at.lat.toFixed(6)},${at.lng.toFixed(6)},${at.zoom}z` } : { location_name: l.country };
      const { items, cost } = await dfs.live('/v3/serp/google/maps/live/advanced', { keyword, ...where, ...lang(l), depth });
      return {
        cost,
        results: items.flatMap((i) => {
          const m = mapsItem.safeParse(i);
          if (!m.success || !m.data.title) return [];
          const d = m.data;
          return [{ title: d.title!, domain: d.domain ?? null, cid: d.cid ?? null, position: d.rank_group ?? 0, rating: d.rating?.value ?? null, reviews: d.rating?.votes_count ?? null, category: d.category ?? null, address: d.address ?? null, phone: d.phone ?? null, lat: d.latitude ?? null, lng: d.longitude ?? null }];
        }),
      };
    },
    /** 9.1 the full Business Profile. */
    async profile(cid: string, l: Locale): Promise<{ profile: Profile | null; cost: number }> {
      const { items, cost } = await dfs.live('/v3/business_data/google/my_business_info/live', { keyword: `cid:${cid}`, location_name: l.country, ...lang(l) });
      const p = infoItem.safeParse(items[0]);
      if (!p.success || !p.data.title) return { profile: null, cost };
      const d = p.data;
      const attrs = Object.values(d.attributes?.available_attributes ?? {}).reduce((s, a) => s + a.length, 0);
      return {
        cost,
        profile: {
          title: d.title!, cid: d.cid ?? cid, placeId: d.place_id ?? null, category: d.category ?? null, extraCategories: d.additional_categories ?? [], description: d.description ?? null,
          phone: d.phone ?? null, address: d.address ?? d.address_info?.address ?? null, city: d.address_info?.city ?? null, zip: d.address_info?.zip ?? null, website: d.url ?? null,
          domain: d.domain?.replace(/^www\./, '') ?? null, photos: d.total_photos ?? null, claimed: d.is_claimed ?? null, attributes: attrs, hours: Boolean(d.work_time?.work_hours?.timetable && Object.keys(d.work_time.work_hours.timetable).length),
          logo: Boolean(d.logo || d.main_image), lat: d.latitude ?? null, lng: d.longitude ?? null, rating: d.rating?.value ?? null, reviews: d.rating?.votes_count ?? null,
        },
      };
    },
    /** 9.4 newest reviews: set the task now, read it a little later. */
    async postReviews(cid: string, l: Locale, depth = 100) {
      return dfs.post('/v3/business_data/google/reviews/task_post', { keyword: `cid:${cid}`, location_name: l.country, ...lang(l), depth, sort_by: 'newest' });
    },
    async getReviews(id: string): Promise<{ ready: boolean; reviews: Review[]; total: number | null }> {
      const r = await dfs.get('/v3/business_data/google/reviews/task_get', id);
      const total = (r.result as { reviews_count?: number } | null)?.reviews_count ?? null;
      return {
        ready: r.ready,
        total,
        reviews: r.items.flatMap((i) => {
          const v = reviewItem.safeParse(i);
          return v.success ? [{ rating: v.data.rating?.value ?? null, date: v.data.timestamp?.slice(0, 10) ?? null, answered: Boolean(v.data.owner_answer?.trim()) }] : [];
        }),
      };
    },
    /** 9.5 Business Profile posts. */
    async postUpdates(cid: string, l: Locale, depth = 10) {
      return dfs.post('/v3/business_data/google/my_business_updates/task_post', { keyword: `cid:${cid}`, location_name: l.country, ...lang(l), depth });
    },
    async getUpdates(id: string): Promise<{ ready: boolean; dates: string[] }> {
      const r = await dfs.get('/v3/business_data/google/my_business_updates/task_get', id);
      return { ready: r.ready, dates: r.items.flatMap((i) => { const p = postItem.safeParse(i); return p.success && p.data.timestamp ? [p.data.timestamp.slice(0, 10)] : []; }) };
    },
    /** 9.5 questions and answers on the profile. */
    async questions(cid: string, l: Locale): Promise<{ total: number; unanswered: number; latest: string | null; cost: number }> {
      const { result, cost } = await dfs.live('/v3/business_data/google/questions_and_answers/live', { keyword: `cid:${cid}`, location_name: l.country, ...lang(l), depth: 20 });
      const r = result as { items?: unknown[] | null; items_without_answers?: unknown[] | null } | null;
      const all = [...(r?.items ?? []), ...(r?.items_without_answers ?? [])].flatMap((i) => { const q = qaItem.safeParse(i); return q.success ? [q.data] : []; });
      const dates = all.map((q) => q.timestamp?.slice(0, 10) ?? '').filter(Boolean).sort();
      return { total: all.length, unanswered: r?.items_without_answers?.length ?? 0, latest: dates[dates.length - 1] ?? null, cost };
    },
    /** 9.3 where the business shows up on the web (top 100 results for its name). */
    async listings(query: string, l: Locale): Promise<{ hits: ListingHit[]; cost: number }> {
      const { items, cost } = await dfs.live('/v3/serp/google/organic/live/advanced', { keyword: query, location_name: l.country, ...lang(l), depth: 100, resolve_goto_urls: true });
      return {
        cost,
        hits: items.flatMap((i) => {
          const o = organicItem.safeParse(i);
          return o.success && o.data.type === 'organic' && o.data.domain && o.data.url ? [{ domain: o.data.domain.replace(/^www\./, ''), url: o.data.url, title: o.data.title ?? null, snippet: o.data.description ?? null }] : [];
        }),
      };
    },
  };
}
export type LocalClient = ReturnType<typeof createLocalClient>;
