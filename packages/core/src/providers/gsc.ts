import { z } from 'zod';
import { request, requestJson, type HttpLog } from './http';

/**
 * Google Search Console (spec §5.5), read-only. Endpoints confirmed against
 * developers.google.com/webmaster-tools/v1 (2026-11-16):
 *  - sites.list            GET  https://www.googleapis.com/webmasters/v3/sites
 *  - searchAnalytics.query POST https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query (rowLimit ≤ 25,000)
 *  - sitemaps.list         GET  https://www.googleapis.com/webmasters/v3/sites/{site}/sitemaps
 *  - urlInspection         POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect (2,000/day, 600/min per property)
 * All accept the webmasters.readonly scope.
 */

export const GSC_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly'];
const API = 'https://www.googleapis.com/webmasters/v3';

export type GoogleOAuth = { clientId: string; clientSecret: string; redirectUri: string };

/** Customers connect their own Google account: Search Console and Analytics 4, both read-only. */
export const CUSTOMER_GOOGLE_SCOPES = [...GSC_SCOPES, 'https://www.googleapis.com/auth/analytics.readonly'];

export function gscAuthUrl(o: GoogleOAuth, state: string, scopes: string[] = GSC_SCOPES): string {
  const qs = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    // offline + consent: Google returns a refresh token every time the admin connects.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

async function tokenRequest(body: Record<string, string>, log?: HttpLog) {
  const res = await request('https://oauth2.googleapis.com/token', {
    provider: 'google-oauth',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    rawBody: new URLSearchParams(body).toString(),
    timeoutMs: 15_000,
    retries: 1,
    log,
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const err = (json as { error?: string; error_description?: string }) ?? {};
    throw new Error(`Google sign-in failed: ${err.error_description ?? err.error ?? res.status}`);
  }
  return tokenSchema.parse(json);
}

/** Exchanges the OAuth callback code. Returns the refresh token and the Google account's email. */
export async function exchangeGscCode(o: GoogleOAuth, code: string, log?: HttpLog): Promise<{ refreshToken: string; email: string; scopes: string }> {
  const t = await tokenRequest({ code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: 'authorization_code' }, log);
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove MS SCORE from your Google account permissions and connect again.');
  // The id_token comes straight from Google's token endpoint over TLS, so its payload can be read without verifying the signature.
  const payload = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string }) : {};
  return { refreshToken: t.refresh_token, email: payload.email ?? 'unknown', scopes: t.scope ?? GSC_SCOPES.join(' ') };
}

export async function refreshGscToken(o: Omit<GoogleOAuth, 'redirectUri'>, refreshToken: string, log?: HttpLog): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: 'refresh_token' }, log);
  return t.access_token;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const site = (property: string) => encodeURIComponent(property);

const sitesSchema = z.object({ siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string() })).optional() });

/** Properties the connected account can read (unverified ones are left out). */
export async function listGscSites(token: string, log?: HttpLog): Promise<string[]> {
  const json = sitesSchema.parse(await requestJson(`${API}/sites`, { provider: 'gsc', headers: auth(token), timeoutMs: 15_000, retries: 1, log }));
  return (json.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').map((s) => s.siteUrl).sort();
}

/**
 * Whether the signed-in account can read one property (Search Console sites.get). Used to check a
 * customer's choice directly instead of comparing it with a fresh property list.
 */
export async function gscCanRead(token: string, property: string, log?: HttpLog): Promise<boolean> {
  try {
    const json = z.object({ siteUrl: z.string().optional(), permissionLevel: z.string().optional() }).parse(
      await requestJson(`${API}/sites/${site(property)}`, { provider: 'gsc', headers: auth(token), timeoutMs: 15_000, retries: 1, log }),
    );
    return json.permissionLevel !== 'siteUnverifiedUser';
  } catch {
    return false;
  }
}

/** Properties that cover the audited host: sc-domain:example.com, or a URL-prefix property on the same host. */
export function matchGscProperties(properties: string[], url: string): string[] {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return [];
  }
  const bare = host.replace(/^www\./, '');
  const scored = properties.flatMap((p) => {
    if (p.startsWith('sc-domain:')) {
      const d = p.slice('sc-domain:'.length).toLowerCase();
      return bare === d || bare.endsWith(`.${d}`) ? [{ p, rank: 0 }] : [];
    }
    try {
      const h = new URL(p).hostname.toLowerCase();
      if (h === host) return [{ p, rank: 1 }];
      return h.replace(/^www\./, '') === bare ? [{ p, rank: 2 }] : [];
    } catch {
      return [];
    }
  });
  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.p);
}

const rowSchema = z.object({ keys: z.array(z.string()).optional(), clicks: z.number(), impressions: z.number(), ctr: z.number(), position: z.number() });
export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

/** Search Analytics (web), paged by 25,000 rows up to `maxRows`. */
export async function gscSearchAnalytics(
  token: string,
  property: string,
  q: { startDate: string; endDate: string; dimensions: ('page' | 'query')[]; maxRows?: number },
  log?: HttpLog,
): Promise<GscRow[]> {
  const out: GscRow[] = [];
  const max = q.maxRows ?? 25_000;
  for (let startRow = 0; startRow < max; startRow += 25_000) {
    const json = z.object({ rows: z.array(rowSchema).optional() }).parse(
      await requestJson(`${API}/sites/${site(property)}/searchAnalytics/query`, {
        provider: 'gsc',
        method: 'POST',
        headers: auth(token),
        body: { startDate: q.startDate, endDate: q.endDate, dimensions: q.dimensions, type: 'web', rowLimit: Math.min(25_000, max - startRow), startRow },
        timeoutMs: 30_000,
        retries: 1,
        log,
      }),
    );
    const rows = json.rows ?? [];
    out.push(...rows.map((r) => ({ ...r, keys: r.keys ?? [] })));
    if (rows.length < 25_000) break;
  }
  return out;
}

const sitemapSchema = z.object({
  sitemap: z
    .array(
      z.object({
        path: z.string(),
        lastSubmitted: z.string().optional(),
        lastDownloaded: z.string().optional(),
        isPending: z.boolean().optional(),
        errors: z.coerce.number().optional(),
        warnings: z.coerce.number().optional(),
      }),
    )
    .optional(),
});
export type GscSitemap = z.infer<typeof sitemapSchema>['sitemap'] extends (infer T)[] | undefined ? T : never;

export async function gscSitemaps(token: string, property: string, log?: HttpLog): Promise<GscSitemap[]> {
  return sitemapSchema.parse(await requestJson(`${API}/sites/${site(property)}/sitemaps`, { provider: 'gsc', headers: auth(token), timeoutMs: 15_000, retries: 1, log })).sitemap ?? [];
}

const inspectSchema = z.object({
  inspectionResult: z.object({
    indexStatusResult: z
      .object({
        verdict: z.string().optional(),
        coverageState: z.string().optional(),
        indexingState: z.string().optional(),
        pageFetchState: z.string().optional(),
        robotsTxtState: z.string().optional(),
        googleCanonical: z.string().optional(),
        userCanonical: z.string().optional(),
        lastCrawlTime: z.string().optional(),
      })
      .optional(),
  }),
});
export type GscInspection = { url: string } & NonNullable<z.infer<typeof inspectSchema>['inspectionResult']['indexStatusResult']>;

export class GscQuotaError extends Error {}

export async function gscInspect(token: string, property: string, url: string, log?: HttpLog): Promise<GscInspection> {
  const res = await request('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    provider: 'gsc-inspect',
    method: 'POST',
    headers: auth(token),
    body: { inspectionUrl: url, siteUrl: property },
    timeoutMs: 20_000,
    retries: 0,
    log,
  });
  if (res.status === 429) throw new GscQuotaError('URL Inspection quota reached');
  const json = (await res.json()) as unknown;
  if (!res.ok) throw new Error(`URL Inspection ${res.status}`);
  return { url, ...(inspectSchema.parse(json).inspectionResult.indexStatusResult ?? {}) };
}
