import { z } from 'zod';
import { requestJson, type HttpLog } from './http';

/**
 * Google Analytics 4, read-only (scope analytics.readonly). Checked against
 * developers.google.com on 2026-11-17:
 *  - Admin API accountSummaries.list  GET  https://analyticsadmin.googleapis.com/v1beta/accountSummaries (pageSize ≤ 200)
 *  - Admin API dataStreams.list       GET  https://analyticsadmin.googleapis.com/v1beta/properties/{id}/dataStreams
 *      (type WEB_DATA_STREAM, webStreamData.defaultUri)
 *  - Data API runReport               POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport
 *      (metrics sessions, keyEvents; dateRanges startDate/endDate with "NdaysAgo" / "yesterday")
 */
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const summaries = z.object({
  accountSummaries: z
    .array(
      z.object({
        account: z.string(),
        displayName: z.string().optional(),
        propertySummaries: z.array(z.object({ property: z.string(), displayName: z.string().optional(), propertyType: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

export type Ga4Property = { account: string; accountName: string; property: string; name: string };

/** Every GA4 property the signed-in Google account can read, grouped by account. */
export async function listGa4Properties(token: string, log?: HttpLog): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ pageSize: '200', ...(pageToken ? { pageToken } : {}) });
    const json = summaries.parse(await requestJson(`${ADMIN}/accountSummaries?${qs}`, { provider: 'ga4', headers: auth(token), timeoutMs: 20_000, retries: 1, log }));
    for (const a of json.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        if (p.propertyType && p.propertyType !== 'PROPERTY_TYPE_ORDINARY') continue; // roll-up / sub-properties have no own streams
        out.push({ account: a.account, accountName: a.displayName ?? a.account, property: p.property, name: p.displayName ?? p.property });
      }
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

const streams = z.object({
  dataStreams: z.array(z.object({ type: z.string().optional(), webStreamData: z.object({ defaultUri: z.string().optional() }).optional() })).optional(),
});

/** Website addresses of a property's web data streams (to match a property to a site). */
export async function ga4WebStreamHosts(token: string, property: string, log?: HttpLog): Promise<string[]> {
  const json = streams.parse(await requestJson(`${ADMIN}/${property}/dataStreams?pageSize=200`, { provider: 'ga4', headers: auth(token), timeoutMs: 20_000, retries: 1, log }));
  return (json.dataStreams ?? [])
    .filter((s) => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.defaultUri)
    .map((s) => {
      try {
        return new URL(s.webStreamData!.defaultUri!).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

const report = z.object({
  rows: z.array(z.object({ metricValues: z.array(z.object({ value: z.string().optional() })).optional() })).optional(),
});

export type Ga4Summary = { sessions: number; keyEvents: number; days: number };

/** Sessions and key events (calls, forms… whatever the site marks as key events) for the last `days` days. */
export async function ga4Summary(token: string, property: string, days = 28, log?: HttpLog): Promise<Ga4Summary> {
  const json = report.parse(
    await requestJson(`${DATA}/${property}:runReport`, {
      provider: 'ga4',
      method: 'POST',
      headers: auth(token),
      body: { dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }] },
      timeoutMs: 20_000,
      retries: 1,
      log,
    }),
  );
  const values = json.rows?.[0]?.metricValues ?? [];
  const num = (i: number) => Math.round(Number(values[i]?.value ?? 0)) || 0;
  return { sessions: num(0), keyEvents: num(1), days };
}

/** Module 7.1: sessions and key events per landing page (dimension `landingPage`, the page path). */
export async function ga4LandingPages(token: string, property: string, days = 90, log?: HttpLog): Promise<{ path: string; sessions: number; keyEvents: number }[]> {
  const rows = z.object({ rows: z.array(z.object({ dimensionValues: z.array(z.object({ value: z.string() })), metricValues: z.array(z.object({ value: z.string() })) })).optional() }).parse(
    await requestJson(`${DATA}/${property}:runReport`, {
      provider: 'ga4',
      method: 'POST',
      headers: auth(token),
      body: { dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }], limit: 1000 },
      timeoutMs: 20_000,
      retries: 1,
      log,
    }),
  );
  return (rows.rows ?? []).map((r) => ({ path: r.dimensionValues[0]?.value ?? '', sessions: Math.round(Number(r.metricValues[0]?.value ?? 0)) || 0, keyEvents: Math.round(Number(r.metricValues[1]?.value ?? 0)) || 0 }));
}

/** Properties whose web stream matches the site's domain come first (best match). */
export function matchGa4Properties(props: (Ga4Property & { hosts?: string[] })[], domain: string): (Ga4Property & { hosts?: string[]; matches: boolean })[] {
  const d = domain.replace(/^www\./, '').toLowerCase();
  const hit = (p: Ga4Property & { hosts?: string[] }) => Boolean(p.hosts?.some((h) => h === d || h.endsWith(`.${d}`)) || p.name.toLowerCase().includes(d));
  return props.map((p) => ({ ...p, matches: hit(p) })).sort((a, b) => Number(b.matches) - Number(a.matches) || a.accountName.localeCompare(b.accountName) || a.name.localeCompare(b.name));
}
