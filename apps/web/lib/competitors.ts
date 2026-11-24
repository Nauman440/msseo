import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { COMPETITOR_COUNTRIES, defaultSearches, emptyWorkspace, normDomain, type CompetitorWorkspace, repairCompetitors } from '@seo/core';
import { accountSites, domainOf, getAccountByUserId, listAccounts, type Account, siteProfile } from './accounts';
import { usingDatabase } from './audit-store';
import { getSessionUser, type SessionUser } from './session';
import { isTeamRole } from './users';

/**
 * Module 3 workspaces: Postgres when DATABASE_URL is set, a JSON file per site in
 * DATA_DIR/competitors otherwise (so the whole module can be tested without a database).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'competitors');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);

const LANG: Record<string, string> = { English: 'en', Urdu: 'ur', Arabic: 'ar', Spanish: 'es', French: 'fr' };

/** A first workspace pre-filled from a customer's onboarding (country, language, services × areas). */
function fromAccount(domain: string, account: Account | undefined): CompetitorWorkspace {
  if (!account) return emptyWorkspace(domain);
  const country = (COMPETITOR_COUNTRIES as readonly string[]).find((c) => c.toLowerCase() === (account.country ?? '').trim().toLowerCase());
  // Searches from the sign-up answers only for the sign-up website; another website gets its own later.
  const p = siteProfile(account, domain);
  return emptyWorkspace(domain, { country, language: LANG[account.language ?? ''] ?? 'en', searches: defaultSearches(p.services, p.areas) });
}

/** The saved workspace, or null (reports use this: no defaults are built). */
export async function getSavedWorkspace(rawDomain: string): Promise<CompetitorWorkspace | null> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getCompetitorWorkspace } = await import('@seo/db');
    return getCompetitorWorkspace(domain).catch(() => null);
  }
  try {
    return JSON.parse(await readFile(file(domain), 'utf8')) as CompetitorWorkspace;
  } catch {
    return null;
  }
}

export async function getWorkspace(rawDomain: string): Promise<CompetitorWorkspace> {
  const domain = normDomain(rawDomain);
  const saved = await getSavedWorkspace(domain);
  if (saved) {
    // Older workspaces may hold unrelated sites picked from the competitor database: drop them once.
    const { workspace, changed } = repairCompetitors(saved);
    if (changed) await saveWorkspace(workspace).catch(() => undefined);
    return workspace;
  }
  const account = (await listAccounts()).find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  return fromAccount(domain, account);
}

export async function saveWorkspace(ws: CompetitorWorkspace): Promise<void> {
  if (usingDatabase()) {
    const { saveCompetitorWorkspace } = await import('@seo/db');
    await saveCompetitorWorkspace(ws);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(ws.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(ws, null, 2));
  await rename(tmp, file(ws.domain));
}

export type CompetitorViewer = { user: SessionUser; kind: 'team' | 'customer' };

/** The team can open any site's competitors; a customer only their own websites. */
export async function competitorAccess(rawDomain: string): Promise<CompetitorViewer | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (isTeamRole(user.role)) return { user, kind: 'team' };
  if (user.role !== 'customer' || !user.id) return null;
  const account = await getAccountByUserId(user.id);
  const domain = normDomain(rawDomain);
  return account && accountSites(account).some((w) => domainOf(w) === domain) ? { user, kind: 'customer' } : null;
}

/** Record a paid run in ApiUsage (database only; the team sees it under Audit settings). */
export async function logCompetitorCost(calls: number, costUsd: number): Promise<void> {
  if (!usingDatabase() || !calls) return;
  const { prisma } = await import('@seo/db');
  await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: 'calls', units: calls, costUsd } }).catch(() => undefined);
}
