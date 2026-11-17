import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildMapping, emptyMapping, normDomain, pageKeywordMap, type MappingWorkspace } from '@seo/core';
import { accountSites, domainOf, listAccounts } from './accounts';
import { usingDatabase } from './audit-store';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace, gscQueryPages } from './keywords';

/**
 * Module 5 workspaces: Postgres when DATABASE_URL is set, a JSON file per site in
 * DATA_DIR/mapping otherwise. Access is the same as Modules 3 and 4 (`competitorAccess`).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'mapping');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);

export async function getMapping(rawDomain: string): Promise<MappingWorkspace> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getMappingWorkspace } = await import('@seo/db');
    return (await getMappingWorkspace(domain).catch(() => null)) ?? emptyMapping(domain);
  }
  try {
    return JSON.parse(await readFile(file(domain), 'utf8')) as MappingWorkspace;
  } catch {
    return emptyMapping(domain);
  }
}

export async function saveMapping(ws: MappingWorkspace): Promise<void> {
  if (usingDatabase()) {
    const { saveMappingWorkspace } = await import('@seo/db');
    await saveMappingWorkspace(ws);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(ws.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(ws));
  await rename(tmp, file(ws.domain));
}

/** Module 5 feeds Module 2: the mapped primary keyword per page (for in-process audits). */
export async function pageKeywordsFromStore(url: string): Promise<Record<string, string>> {
  return pageKeywordMap(await getMapping(domainOf(url)));
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** The business name for drafts: the customer's business name, else the domain in words. */
export async function brandFor(domain: string): Promise<string> {
  const account = (await listAccounts()).find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  return account?.businessName || titleCase(domain.split('.')[0]!.replace(/-/g, ' '));
}

/** Everything 5.1–5.11 needs, then the rebuilt plan (hand edits kept). Free: no paid API calls. */
export async function rebuildMapping(rawDomain: string): Promise<{ ws: MappingWorkspace; problem?: 'no-topics' | 'no-audit' }> {
  const domain = normDomain(rawDomain);
  const [keywords, audits, gsc, previous, accounts] = await Promise.all([
    getKeywordWorkspace(domain),
    customerAudits(`https://${domain}/`),
    gscQueryPages(domain),
    getMapping(domain),
    listAccounts(),
  ]);
  if (!keywords.clusters.length) return { ws: previous, problem: 'no-topics' };
  const pages = audits.latest?.pages;
  if (!pages?.length) return { ws: previous, problem: 'no-audit' };
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  const brand = account?.businessName || titleCase(domain.split('.')[0]!.replace(/-/g, ' '));
  const latestId = audits.rows.find((r) => r.status === 'completed')?.id ?? null;
  const ws = buildMapping({
    domain,
    clusters: keywords.clusters,
    keywords: keywords.keywords,
    pages,
    gsc,
    questions: keywords.questions,
    previous,
    brand,
    place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null,
    auditId: latestId,
  });
  await saveMapping(ws);
  return { ws };
}
