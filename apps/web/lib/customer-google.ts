import 'server-only';
import {
  ga4Summary, ga4WebStreamHosts, gscSearchAnalytics, gscTotals, listGa4Properties, searchesFrom, listGscSites, matchGa4Properties, matchGscProperties, weeklyPlan,
  type Ga4Property, type Ga4Summary, type PlanRow, type ReportModel,
} from '@seo/core';
import { usingDatabase } from './audit-store';
import { siteUrl } from '@seo/core';

/**
 * A customer's own Google connection (Search Console + Analytics 4), for their dashboard.
 * Needs Postgres plus GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / ENCRYPTION_KEY; without
 * them the dashboard shows "Connect Google" but connecting says it is not available yet.
 */
export type SiteChoice = { gscProperty: string | null; ga4Property: string | null; ga4Name: string | null };
export type GoogleStatus = { ready: boolean; email: string | null; site: SiteChoice | null };

export async function googleStatus(userId: string, domain: string): Promise<GoogleStatus> {
  if (!usingDatabase()) return { ready: false, email: null, site: null };
  const db = await import('@seo/db');
  if (!db.customerGoogleReady()) return { ready: false, email: null, site: null };
  const conn = await db.getCustomerGoogle(userId).catch(() => null);
  const site = conn?.sites[domain];
  return { ready: true, email: conn?.googleEmail ?? null, site: site ? { gscProperty: site.gscProperty, ga4Property: site.ga4Property, ga4Name: site.ga4Name } : null };
}

/** Connected = Search Console chosen for this website (Analytics is optional). */
export const isConnected = (s: GoogleStatus) => Boolean(s.site?.gscProperty);

export type GscOption = { property: string; kind: 'Domain' | 'URL prefix'; best: boolean };
export type Ga4Option = Ga4Property & { matches: boolean };

/** What the signed-in Google account can see: Search Console properties and GA4 properties, best matches first. */
export async function googleChoices(userId: string, domain: string): Promise<{ email: string; gsc: GscOption[]; ga4: Ga4Option[]; error?: string }> {
  const db = await import('@seo/db');
  const conn = await db.getCustomerGoogle(userId);
  if (!conn) throw new Error('Google is not connected');
  const token = await db.customerGoogleToken(userId);
  const [sites, props] = await Promise.all([listGscSites(token).catch(() => [] as string[]), listGa4Properties(token).catch(() => [] as Ga4Property[])]);
  const matching = matchGscProperties(sites, siteUrl(domain));
  const gsc: GscOption[] = [...matching, ...sites.filter((s) => !matching.includes(s))].map((p, i) => ({
    property: p,
    kind: p.startsWith('sc-domain:') ? 'Domain' : 'URL prefix',
    best: i === 0 && matching.includes(p),
  }));
  // Read web streams for up to 25 properties to find the one for this website.
  const withHosts = await Promise.all(props.slice(0, 25).map(async (p) => ({ ...p, hosts: await ga4WebStreamHosts(token, p.property).catch(() => [] as string[]) })));
  const ga4 = matchGa4Properties([...withHosts, ...props.slice(25)], domain);
  return { email: conn.googleEmail, gsc, ga4, ...(!sites.length && !props.length ? { error: 'This Google account has no Search Console or Analytics properties.' } : {}) };
}

export type SiteGoogleData = {
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  ga4: Ga4Summary | null;
  plan: PlanRow[];
  /** Top 100 searches by impressions (Rankings tab). */
  searches: { query: string; position: number; impressions: number; clicks: number; page: string | null }[];
  errors: string[];
};

const cache = new Map<string, { at: number; data: SiteGoogleData }>();
const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/** Last 28 days from Search Console and Analytics, plus this week's plan. Cached 30 minutes; never throws. */
export async function siteGoogleData(userId: string, domain: string, choice: SiteChoice, report?: ReportModel | null): Promise<SiteGoogleData> {
  const key = `${userId}|${domain}|${choice.gscProperty}|${choice.ga4Property}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  const db = await import('@seo/db');
  const errors: string[] = [];
  const data: SiteGoogleData = { clicks: null, impressions: null, position: null, ga4: null, plan: [], searches: [], errors };
  try {
    const token = await db.customerGoogleToken(userId);
    // Search Console data ends ~3 days ago; GA4 up to yesterday.
    const range = { startDate: day(31), endDate: day(3) };
    await Promise.all([
      choice.gscProperty
        ? Promise.all([
            gscSearchAnalytics(token, choice.gscProperty, { ...range, dimensions: [], maxRows: 1 }),
            gscSearchAnalytics(token, choice.gscProperty, { ...range, dimensions: ['query', 'page'], maxRows: 5000 }),
          ])
            .then(([totals, rows]) => {
              const t = gscTotals(totals);
              Object.assign(data, {
                clicks: t.clicks,
                impressions: t.impressions,
                position: t.position,
                plan: weeklyPlan(rows, report),
                searches: searchesFrom(rows).sort((a, b) => b.impressions - a.impressions).slice(0, 100),
              });
            })
            .catch((err: unknown) => void errors.push(`Search Console: ${err instanceof Error ? err.message : String(err)}`))
        : null,
      choice.ga4Property
        ? ga4Summary(token, choice.ga4Property, 28)
            .then((g) => void (data.ga4 = g))
            .catch((err: unknown) => void errors.push(`Analytics: ${err instanceof Error ? err.message : String(err)}`))
        : null,
    ]);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (!errors.length) cache.set(key, { at: Date.now(), data });
  return data;
}

/** Drops cached numbers after the customer changes their properties. */
export function forgetSiteGoogleData(userId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${userId}|`)) cache.delete(k);
}
