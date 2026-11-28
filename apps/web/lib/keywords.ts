import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addKeywords, cleanKeywords, clusterKeywords, COMPETITOR_COUNTRIES, emptyKeywordWorkspace, gscSearchAnalytics, KEYWORD_QUALITY_VERSION, matchGscProperties, normDomain, siteVocabulary, type GscQuery, type KeywordClient, type KeywordWorkspace } from '@seo/core';
import { accountSites, domainOf, listAccounts, type Account, siteProfile } from './accounts';
import { usingDatabase } from './audit-store';
import { getSavedWorkspace } from './competitors';
import { siteUrl } from '@seo/core';

/**
 * Module 4 workspaces: Postgres when DATABASE_URL is set, a JSON file per site in
 * DATA_DIR/keywords otherwise. Access is the same as Module 3 (`competitorAccess`).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'keywords');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);
const LANG: Record<string, string> = { English: 'en', Urdu: 'ur', Arabic: 'ar', Spanish: 'es', French: 'fr' };

async function accountFor(domain: string): Promise<Account | undefined> {
  return (await listAccounts()).find((a) => accountSites(a).some((w) => domainOf(w) === domain));
}

export async function getKeywordWorkspace(rawDomain: string): Promise<KeywordWorkspace> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getKeywordWorkspace: get } = await import('@seo/db');
    const saved = await get(domain).catch(() => null);
    if (saved) return saved;
  } else {
    try {
      return JSON.parse(await readFile(file(domain), 'utf8')) as KeywordWorkspace;
    } catch {
      // no saved workspace yet
    }
  }
  // First visit: the sign-up website starts from the onboarding answers (services, areas). Any other
  // website starts empty; autopilot fills its research inputs from its own pages.
  const account = await accountFor(domain);
  const primary = Boolean(account?.website && domainOf(account.website) === domain);
  const competitors = await getSavedWorkspace(domain);
  const country = (COMPETITOR_COUNTRIES as readonly string[]).find((c) => c.toLowerCase() === (account?.country ?? '').trim().toLowerCase()) ?? competitors?.country;
  const ws = emptyKeywordWorkspace(domain, {
    country,
    language: account ? LANG[account.language ?? ''] ?? 'en' : competitors?.language,
    seeds: primary ? { services: account?.services ?? [], locations: account?.areas ?? [] } : { services: [], locations: [] },
  });
  // Keywords the owner typed in at sign-up: kept as typed by hand; metrics come with the first research.
  return primary && account?.keywords?.length ? addKeywords(ws, account.keywords, 'manual').workspace : ws;
}

export async function saveKeywordWorkspace(ws: KeywordWorkspace): Promise<void> {
  if (usingDatabase()) {
    const { saveKeywordWorkspace: save } = await import('@seo/db');
    await save(ws);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(ws.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(ws));
  await rename(tmp, file(ws.domain));
}

const GIANT_ETV = 1_000_000;

/** Competitors to mine for keywords: shortlisted direct ones first, then the customer's own list. */
export async function researchCompetitors(domain: string): Promise<{ domains: string[]; names: string[] }> {
  const ws = await getSavedWorkspace(domain);
  const ranked = (ws?.competitors ?? [])
    .filter((c) => c.type !== 'directory' && c.type !== 'publisher')
    .sort((a, b) => Number(b.shortlist === 'direct') - Number(a.shortlist === 'direct') || Number(b.type === 'direct') - Number(a.type === 'direct') || b.seenIn - a.seenIn);
  const account = await accountFor(domain);
  // Giants (over a million visits a month) rank for everything; their keyword lists drown a small site's.
  const usable = ranked.filter((c) => (c.shortlist !== 'none' || c.type === 'direct') && (c.etv ?? 0) <= GIANT_ETV);
  const domains = [...new Set([...usable.map((c) => c.domain), ...siteProfile(account, domain).competitors.map(normDomain)])].filter((d) => d.includes('.'));
  const names = [...domains, ...ranked.filter((c) => c.shortlist !== 'none' || c.type === 'direct').map((c) => c.domain), ...ranked.map((c) => c.name ?? '').filter(Boolean)];
  return { domains: domains.slice(0, 3), names };
}

/**
 * Search Console rows by search and page for the last 90 days (ending 3 days ago): the site's
 * customer's own connection first, else the team's agency connection. Empty when neither can see it.
 */
/** Search Console access for a site: the customer's own connection first, else the team's agency one. */
export async function gscAccess(domain: string): Promise<{ token: string; property: string } | null> {
  if (!usingDatabase()) return null;
  try {
    const db = await import('@seo/db');
    const owner = await accountFor(domain);
    const own = owner && db.customerGoogleReady() ? await db.getCustomerGoogle(owner.userId).catch(() => null) : null;
    const ownProperty = own?.sites[domain]?.gscProperty ?? null;
    if (own && ownProperty) return { token: await db.customerGoogleToken(owner!.userId), property: ownProperty };
    if (!db.gscSetup().ready || !(await db.getGscConnection())) return null;
    const property = matchGscProperties(await db.gscProperties(), siteUrl(domain))[0];
    return property ? { token: await db.gscAccessToken(), property } : null;
  } catch {
    return null;
  }
}

/** GA4 for a site: only through the customer's own Google connection (the team has no agency GA4). */
export async function ga4Access(domain: string): Promise<{ token: string; property: string } | null> {
  if (!usingDatabase()) return null;
  try {
    const db = await import('@seo/db');
    const owner = await accountFor(domain);
    const own = owner && db.customerGoogleReady() ? await db.getCustomerGoogle(owner.userId).catch(() => null) : null;
    const property = own?.sites[domain]?.ga4Property ?? null;
    return own && property ? { token: await db.customerGoogleToken(owner!.userId), property } : null;
  } catch {
    return null;
  }
}

export async function gscQueryPages(domain: string): Promise<{ query: string; page: string; clicks: number; impressions: number; position: number }[]> {
  const access = await gscAccess(domain);
  if (!access) return [];
  try {
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    const rows = await gscSearchAnalytics(access.token, access.property, { startDate: day(93), endDate: day(3), dimensions: ['query', 'page'], maxRows: 5000 });
    return rows.flatMap((r) => (r.keys[0] && r.keys[1] ? [{ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }] : []));
  } catch {
    return [];
  }
}

/** Search Console searches for keyword research: one entry per search, with its main page. */
export async function gscQueries(domain: string): Promise<GscQuery[]> {
  const best = new Map<string, GscQuery>();
  for (const r of await gscQueryPages(domain)) {
    const { query, page } = r;
    const prev = best.get(query);
    const merged = { query, page, clicks: (prev?.clicks ?? 0) + r.clicks, impressions: (prev?.impressions ?? 0) + r.impressions, position: r.position };
    // Position and page from the URL with the most impressions.
    best.set(query, prev && prev.impressions >= r.impressions ? { ...merged, page: prev.page, position: prev.position } : merged);
  }
  return [...best.values()];
}

/** Records paid calls in ApiUsage (database only). */
export async function logUsage(provider: 'dataforseo' | 'openai', units: number, costUsd?: number): Promise<void> {
  if (!usingDatabase() || !units) return;
  const { prisma } = await import('@seo/db');
  await prisma.apiUsage.create({ data: { provider, endpoint: provider === 'openai' ? 'tokens' : 'calls', units, costUsd } }).catch(() => undefined);
}

/**
 * Lists cleaned with older rules are cleaned again the first time they are opened (free): relevance to
 * this website (its inputs and its own pages), few hard keywords, few zero-volume ones. Topics are then
 * regrouped from the Google results already saved (no new calls), so their numbers match the list.
 */
export async function freshKeywords(rawDomain: string): Promise<KeywordWorkspace> {
  const domain = normDomain(rawDomain);
  const ws = await getKeywordWorkspace(domain);
  if (!ws.keywords.length || ws.qualityVersion === KEYWORD_QUALITY_VERSION) return ws;
  const [{ customerAudits }, rivals] = await Promise.all([import('./customer-data'), researchCompetitors(domain)]);
  const audits = await customerAudits(siteUrl(domain));
  const titles = (audits.latest?.pages ?? []).flatMap((p) => [p.title ?? '', p.h1 ?? '']).filter(Boolean);
  const siteWords = titles.length ? siteVocabulary(titles) : ws.siteWords;
  const cleaned = cleanKeywords({ ...ws, siteWords }, rivals.names);
  // maxSerps 0: only results already saved are used, so the client is never called.
  const regrouped = cleaned.clusters.length ? (await clusterKeywords({} as KeywordClient, cleaned, { maxSerps: 0 })).workspace : cleaned;
  const next = { ...regrouped, qualityVersion: KEYWORD_QUALITY_VERSION };
  await saveKeywordWorkspace(next);
  return next;
}
