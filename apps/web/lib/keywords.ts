import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { COMPETITOR_COUNTRIES, emptyKeywordWorkspace, gscSearchAnalytics, matchGscProperties, normDomain, type GscQuery, type KeywordWorkspace } from '@seo/core';
import { accountSites, domainOf, listAccounts, type Account } from './accounts';
import { usingDatabase } from './audit-store';
import { getSavedWorkspace } from './competitors';

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
  // First visit: seeds from the customer's onboarding (services, areas), or from Module 3 settings.
  const account = await accountFor(domain);
  const competitors = await getSavedWorkspace(domain);
  const country = (COMPETITOR_COUNTRIES as readonly string[]).find((c) => c.toLowerCase() === (account?.country ?? '').trim().toLowerCase()) ?? competitors?.country;
  return emptyKeywordWorkspace(domain, {
    country,
    language: account ? LANG[account.language ?? ''] ?? 'en' : competitors?.language,
    seeds: { services: account?.services ?? [], locations: account?.areas ?? [] },
  });
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
  const domains = [...new Set([...usable.map((c) => c.domain), ...(account?.competitors ?? []).map(normDomain)])].filter((d) => d.includes('.'));
  const names = [...domains, ...ranked.filter((c) => c.shortlist !== 'none' || c.type === 'direct').map((c) => c.domain), ...ranked.map((c) => c.name ?? '').filter(Boolean)];
  return { domains: domains.slice(0, 3), names };
}

/**
 * Search Console rows by search and page for the last 90 days (ending 3 days ago): the site's
 * customer's own connection first, else the team's agency connection. Empty when neither can see it.
 */
export async function gscQueryPages(domain: string): Promise<{ query: string; page: string; clicks: number; impressions: number; position: number }[]> {
  if (!usingDatabase()) return [];
  try {
    const db = await import('@seo/db');
    // The site's customer connected their own Google: use their chosen property first.
    const owner = await accountFor(domain);
    const own = owner && db.customerGoogleReady() ? await db.getCustomerGoogle(owner.userId).catch(() => null) : null;
    const ownProperty = own?.sites[domain]?.gscProperty ?? null;
    let token: string;
    let property: string | undefined;
    if (own && ownProperty) {
      token = await db.customerGoogleToken(owner!.userId);
      property = ownProperty;
    } else {
      // Otherwise the team's agency connection, when it can see the site.
      if (!db.gscSetup().ready || !(await db.getGscConnection())) return [];
      property = matchGscProperties(await db.gscProperties(), `https://${domain}/`)[0];
      if (!property) return [];
      token = await db.gscAccessToken();
    }
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    const rows = await gscSearchAnalytics(token, property, { startDate: day(93), endDate: day(3), dimensions: ['query', 'page'], maxRows: 5000 });
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
