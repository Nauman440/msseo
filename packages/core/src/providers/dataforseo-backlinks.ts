import { z } from 'zod';
import { createDfsBase } from './dataforseo-base';
import type { DfsConfig } from './dataforseo-competitors';

/**
 * DataForSEO Backlinks + Content Analysis for Module 8 (docs.dataforseo.com, checked 2026-11-19):
 * backlinks/summary, referring_domains, anchors, domain_pages, timeseries_new_lost_summary,
 * backlinks (filters `is_broken`, `backlinks_status_type: lost`), domain_intersection (targets
 * {"1","2"}, exclude_targets; the referring domain is each entry's `target`) and
 * content_analysis/search (brand mentions). Ranks use `rank_scale: one_hundred` (0–100).
 * The Backlinks API may need to be enabled on the account (status 40204 → DfsAccessError).
 */
const num = z.number().nullable().optional();
const str = z.string().nullable().optional();
const counts = z.record(z.string(), z.number()).nullable().optional();

const summarySchema = z.object({
  rank: num, backlinks: num, backlinks_spam_score: num, broken_backlinks: num, broken_pages: num, referring_domains: num, referring_domains_nofollow: num,
  referring_main_domains: num, first_seen: str, referring_links_tld: counts, referring_links_attributes: counts, referring_links_countries: counts, referring_links_platform_types: counts,
}).passthrough();
const domainSchema = z.object({ domain: z.string(), rank: num, backlinks: num, first_seen: str, lost_date: str, backlinks_spam_score: num }).passthrough();
const anchorSchema = z.object({ anchor: str, backlinks: num, referring_domains: num }).passthrough();
const pageSchema = z.object({ page: z.string(), status_code: num, meta: z.object({ title: str }).passthrough().nullable().optional(), page_summary: z.object({ rank: num, backlinks: num, referring_domains: num }).passthrough().nullable().optional() }).passthrough();
const seriesSchema = z.object({ date: z.string(), new_backlinks: num, lost_backlinks: num, new_referring_domains: num, lost_referring_domains: num }).passthrough();
const linkSchema = z.object({ domain_from: str, url_from: str, url_to: str, url_to_status_code: num, anchor: str, dofollow: z.boolean().nullable().optional(), domain_from_rank: num, first_seen: str, last_seen: str, backlink_spam_score: num }).passthrough();
const gapSchema = z.object({ domain_intersection: z.record(z.string(), z.object({ target: z.string(), rank: num, backlinks: num }).passthrough()) }).passthrough();
const mentionSchema = z.object({ url: z.string(), domain: str, main_domain: str, domain_rank: num, content_info: z.object({ title: str, date_published: str }).passthrough().nullable().optional() }).passthrough();

export type LinkSummary = {
  rank: number | null; backlinks: number | null; referringDomains: number | null; nofollowDomains: number | null; spamScore: number | null; brokenBacklinks: number | null; brokenPages: number | null;
  firstSeen: string | null; tld: Record<string, number>; countries: Record<string, number>; attributes: Record<string, number>;
};
export type RefDomain = { domain: string; rank: number | null; backlinks: number | null; firstSeen: string | null; spamScore: number | null };
export type AnchorRow = { anchor: string; backlinks: number; domains: number };
export type LinkedPage = { url: string; status: number | null; title: string | null; backlinks: number; domains: number };
export type NewLost = { date: string; newLinks: number; lostLinks: number; newDomains: number; lostDomains: number };
export type Backlink = { from: string; fromDomain: string; to: string; toStatus: number | null; anchor: string; dofollow: boolean; domainRank: number | null; firstSeen: string | null; lastSeen: string | null; spamScore: number | null };
export type Mention = { url: string; domain: string; title: string | null; date: string | null; domainRank: number | null };

const n0 = (v: number | null | undefined) => v ?? 0;

export function createBacklinksClient(cfg: DfsConfig) {
  const bl = createDfsBase(cfg, 'Backlinks');
  const ca = createDfsBase(cfg, 'Content Analysis');
  const common = { include_subdomains: true, rank_scale: 'one_hundred' };
  return {
    /** 8.1 totals and the shape of the link profile. */
    async summary(target: string): Promise<{ summary: LinkSummary; cost: number }> {
      const { result, cost } = await bl.live('/v3/backlinks/summary/live', { target, ...common, backlinks_status_type: 'live' });
      const s = summarySchema.parse(result ?? {});
      return {
        cost,
        summary: {
          rank: s.rank ?? null, backlinks: s.backlinks ?? null, referringDomains: s.referring_domains ?? null, nofollowDomains: s.referring_domains_nofollow ?? null,
          spamScore: s.backlinks_spam_score ?? null, brokenBacklinks: s.broken_backlinks ?? null, brokenPages: s.broken_pages ?? null, firstSeen: s.first_seen ?? null,
          tld: s.referring_links_tld ?? {}, countries: s.referring_links_countries ?? {}, attributes: s.referring_links_attributes ?? {},
        },
      };
    },
    /** 8.2 / 8.3 the strongest referring domains with their spam scores. */
    async referringDomains(target: string, limit = 200): Promise<{ domains: RefDomain[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/referring_domains/live', { target, ...common, limit, order_by: ['rank,desc'] });
      return { cost, domains: items.map((i) => domainSchema.parse(i)).map((d) => ({ domain: d.domain, rank: d.rank ?? null, backlinks: d.backlinks ?? null, firstSeen: d.first_seen ?? null, spamScore: d.backlinks_spam_score ?? null })) };
    },
    /** 8.4 anchor texts. */
    async anchors(target: string, limit = 100): Promise<{ anchors: AnchorRow[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/anchors/live', { target, ...common, limit, order_by: ['referring_domains,desc'] });
      return { cost, anchors: items.map((i) => anchorSchema.parse(i)).map((a) => ({ anchor: a.anchor ?? '', backlinks: n0(a.backlinks), domains: n0(a.referring_domains) })) };
    },
    /** 8.8 the most linked pages. */
    async topPages(target: string, limit = 20): Promise<{ pages: LinkedPage[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/domain_pages/live', { target, ...common, limit, order_by: ['page_summary.referring_domains,desc', 'page_summary.backlinks,desc'] });
      return {
        cost,
        pages: items.map((i) => pageSchema.parse(i)).map((p) => ({ url: p.page, status: p.status_code ?? null, title: p.meta?.title ?? null, backlinks: n0(p.page_summary?.backlinks), domains: n0(p.page_summary?.referring_domains) })),
      };
    },
    /** 8.3 / 8.5 new and lost links per week (spikes and losses). */
    async newLost(target: string, dateFrom: string): Promise<{ series: NewLost[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/timeseries_new_lost_summary/live', { target, date_from: dateFrom, group_range: 'week', include_subdomains: true });
      return {
        cost,
        series: items.map((i) => seriesSchema.parse(i)).map((s) => ({ date: s.date.slice(0, 10), newLinks: n0(s.new_backlinks), lostLinks: n0(s.lost_backlinks), newDomains: n0(s.new_referring_domains), lostDomains: n0(s.lost_referring_domains) })),
      };
    },
    /** 8.5 links lost since a date (one per domain, strongest first). */
    async lostLinks(target: string, since: string, limit = 100): Promise<{ links: Backlink[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/backlinks/live', { target, ...common, mode: 'one_per_domain', backlinks_status_type: 'lost', filters: ['last_seen', '>', since], order_by: ['domain_from_rank,desc'], limit });
      return { cost, links: items.map(toLink) };
    },
    /** 8.6 live links pointing to pages that now return 4xx/5xx. */
    async brokenLinks(target: string, limit = 100): Promise<{ links: Backlink[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/backlinks/live', { target, ...common, mode: 'as_is', filters: ['is_broken', '=', true], order_by: ['domain_from_rank,desc'], limit });
      return { cost, links: items.map(toLink) };
    },
    /** 8.9 / 6.4.4 domains linking to both competitors and not to the client. */
    async linkGap(a: string, b: string, exclude: string, limit = 100): Promise<{ domains: { domain: string; rank: number | null }[]; cost: number }> {
      const { items, cost } = await bl.live('/v3/backlinks/domain_intersection/live', { targets: { 1: a, 2: b }, exclude_targets: [exclude], ...common, limit, order_by: ['1.rank,desc'] });
      return {
        cost,
        domains: items.flatMap((i) => {
          const g = gapSchema.safeParse(i);
          const first = g.success ? g.data.domain_intersection['1'] : undefined;
          return first ? [{ domain: first.target, rank: first.rank ?? null }] : [];
        }),
      };
    },
    /** 8.7 pages that mention the brand (exact phrase), one per domain. */
    async mentions(brand: string, limit = 100): Promise<{ mentions: Mention[]; cost: number }> {
      const { items, cost } = await ca.live('/v3/content_analysis/search/live', { keyword: `"${brand.replace(/"/g, '')}"`, search_mode: 'one_per_domain', limit, rank_scale: 'one_hundred', order_by: ['domain_rank,desc'] });
      return {
        cost,
        mentions: items.flatMap((i) => {
          const m = mentionSchema.safeParse(i);
          return m.success ? [{ url: m.data.url, domain: (m.data.main_domain ?? m.data.domain ?? '').replace(/^www\./, ''), title: m.data.content_info?.title ?? null, date: m.data.content_info?.date_published ?? null, domainRank: m.data.domain_rank ?? null }] : [];
        }),
      };
    },
  };
}
export type BacklinksClient = ReturnType<typeof createBacklinksClient>;

function toLink(i: unknown): Backlink {
  const l = linkSchema.parse(i);
  return {
    from: l.url_from ?? '', fromDomain: (l.domain_from ?? '').replace(/^www\./, ''), to: l.url_to ?? '', toStatus: l.url_to_status_code ?? null, anchor: l.anchor ?? '',
    dofollow: l.dofollow ?? true, domainRank: l.domain_from_rank ?? null, firstSeen: l.first_seen ?? null, lastSeen: l.last_seen ?? null, spamScore: l.backlink_spam_score ?? null,
  };
}
