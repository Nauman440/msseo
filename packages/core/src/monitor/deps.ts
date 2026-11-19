import { fetchRobotsTxt } from '../aeo/aeo';
import { sitemapUrlList } from '../analysis/deps';
import { createBacklinksClient } from '../providers/dataforseo-backlinks';
import type { DfsConfig, Locale } from '../providers/dataforseo-competitors';
import { createKeywordClient } from '../providers/dataforseo-keywords';
import { createLocalClient } from '../providers/dataforseo-local';
import { ga4Summary } from '../providers/ga4';
import { gscSearchAnalytics } from '../providers/gsc';
import type { HttpLog } from '../providers/http';
import { fetchHtml } from '../tracking/tracking';
import type { DailyDeps, WeeklyDeps } from './monitor';

/** Wires Module 13's checks to the real services (the same in the worker and the web app). */
type Access = { token: string; property: string } | null;
const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

export function buildDailyDeps(o: { domain: string; keyPages: string[]; gsc: Access; log?: HttpLog; certExpiry?: DailyDeps['certExpiry']; audits?: DailyDeps['audits'] }): DailyDeps {
  return {
    fetchPage: (u) => fetchHtml(u, o.log),
    fetchRobots: () => fetchRobotsTxt(o.domain, o.log),
    // Search Console data is about 3 days late: 14 full days ending 3 days ago.
    dailyClicks: o.gsc
      ? async () =>
          (await gscSearchAnalytics(o.gsc!.token, o.gsc!.property, { startDate: day(16), endDate: day(3), dimensions: ['date'], maxRows: 100 }, o.log))
            .map((r) => ({ date: r.keys[0] ?? '', clicks: r.clicks }))
            .sort((a, b) => a.date.localeCompare(b.date))
      : undefined,
    keyPages: o.keyPages,
    certExpiry: o.certExpiry,
    audits: o.audits,
  };
}

export function buildWeeklyDeps(o: { domain: string; gsc: Access; ga4: Access; dfs: DfsConfig | null; locale: Locale; cid: string | null; score: number | null; aiShare: number | null; competitors?: string[]; log?: HttpLog }): WeeklyDeps {
  const kw = o.dfs ? createKeywordClient({ ...o.dfs, log: o.log }) : null;
  const local = o.dfs && o.cid ? createLocalClient({ ...o.dfs, log: o.log }) : null;
  const links = o.dfs ? createBacklinksClient({ ...o.dfs, log: o.log }) : null;
  const mine = (u: string) => {
    const h = hostOf(u);
    return h === o.domain || h.endsWith(`.${o.domain}`);
  };
  return {
    rank: kw
      ? async (k) => {
          // Live results with resolved links can take over 30 s; the call is charged either way, so wait for it.
          const r = await kw.serpUrls(k, o.locale, 90_000);
          const i = r.urls.findIndex(mine);
          return { position: i >= 0 ? i + 1 : null, cost: r.cost };
        }
      : undefined,
    searchConsole: o.gsc
      ? async () => {
          const rows = await gscSearchAnalytics(o.gsc!.token, o.gsc!.property, { startDate: day(30), endDate: day(3), dimensions: [], maxRows: 10 }, o.log);
          const r = rows[0];
          return r ? { clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 } : { clicks: 0, impressions: 0, position: null };
        }
      : undefined,
    analytics: o.ga4 ? async () => ga4Summary(o.ga4!.token, o.ga4!.property, 28, o.log) : undefined,
    reviews: local
      ? async () => {
          const r = await local.profile(o.cid!, o.locale);
          return r.profile ? { reviews: r.profile.reviews, rating: r.profile.rating, cost: r.cost } : { reviews: null, rating: null, cost: r.cost };
        }
      : undefined,
    score: o.score,
    aiShare: o.aiShare,
    // New linking sites need the DataForSEO Backlinks API; without it only new pages are checked (free).
    competitors: (o.competitors ?? []).slice(0, 3).map((d) => ({
      domain: d,
      sitemapUrls: () => sitemapUrlList(d, 5000, o.log),
      newLinkingSites: links
        ? async () => {
            const r = await links.newLost(d, day(7));
            return { count: r.series.reduce((s, x) => s + x.newDomains, 0), cost: r.cost };
          }
        : undefined,
    })),
  };
}
