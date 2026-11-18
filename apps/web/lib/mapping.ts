import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  buildMapping, emptyMapping, fetchPageCheck, gapCount, keywordMap, needsCheck, normDomain, normTerm, normUrl, pageBrief, pageFixes, pageKeywordMap, topicKeywords, updateMappingRow,
  type MappingWorkspace,
} from '@seo/core';
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
    sitemapUrls: audits.latest?.sitemap?.corrected?.urls,
    gsc,
    questions: keywords.questions,
    previous,
    brand,
    place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null,
    places: keywords.businessType === 'shop' ? [] : keywords.seeds.locations,
    auditId: latestId,
  });
  await saveMapping(ws);
  return { ws };
}

/** Brand, place and "People also ask" questions for drafts, fixes and briefs. */
export async function mappingContext(domain: string) {
  const keywords = await getKeywordWorkspace(domain);
  return {
    keywords,
    brand: await brandFor(domain),
    place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null,
    questions: keywords.questions ?? [],
  };
}

/**
 * Everything the one-page keyword map needs. The live page is fetched only when the stored check is
 * missing, older than 7 days, or does not cover keywords moved or added since (free: our own fetch).
 */
export async function loadPageMap(rawDomain: string, clusterId: string, opts: { recheck?: boolean } = {}) {
  const domain = normDomain(rawDomain);
  const [ws0, ctx, audits] = await Promise.all([getMapping(domain), mappingContext(domain), customerAudits(`https://${domain}/`)]);
  let ws = ws0;
  const row0 = ws.rows.find((r) => r.clusterId === clusterId);
  if (!row0) return null;
  const kws = topicKeywords(row0.clusterId, row0.primaryKeyword, ctx.keywords.keywords, ws);
  const terms = kws.map((k) => k.term);
  let checkFailed = false;
  if (row0.url && (opts.recheck || needsCheck(row0, terms))) {
    const check = await fetchPageCheck(row0.url, terms);
    if (check) {
      ws = updateMappingRow(ws, clusterId, { pageCheck: check });
      await saveMapping(ws);
    } else checkFailed = true;
  }
  const row = ws.rows.find((r) => r.clusterId === clusterId)!;
  const fallback = row.url ? audits.latest?.pages?.find((p) => normUrl(p.url) === normUrl(row.url!)) ?? null : null;
  const check = row.pageCheck && row.pageCheck.url === row.url ? row.pageCheck : null;
  const map = keywordMap(row, kws, check, fallback);
  const fixes = pageFixes(row, map, check, { brand: ctx.brand, place: ctx.place, questions: ctx.questions, fallback });
  let brief = null;
  if (!row.url) {
    const { getAnalysis } = await import('./analysis');
    const gap = (await getAnalysis(domain).catch(() => null))?.contentGap.find((g) => normTerm(g.topic) === normTerm(row.topic));
    brief = pageBrief(row, kws, { brand: ctx.brand, place: ctx.place, questions: ctx.questions, rivalWords: gap?.rivals.map((r) => r.words) });
  }
  // The next topic with a page, for "Next page".
  const withPage = ws.rows.filter((r) => r.url);
  const at = withPage.findIndex((r) => r.clusterId === clusterId);
  const next = withPage.length > 1 ? withPage[(at + 1) % withPage.length] ?? null : null;
  return { ws, row, kws, map, fixes, brief, check, checkFailed, gaps: gapCount(map), next: next && next.clusterId !== clusterId ? next.clusterId : null, pages: audits.latest?.pages ?? [] };
}

/** Fix counts for the overview cards, without fetching pages (stored checks, else the audit's title and H1). */
export async function fixCounts(ws: MappingWorkspace): Promise<Record<string, number>> {
  if (!ws.rows.length) return {};
  const [ctx, audits] = await Promise.all([mappingContext(ws.domain), customerAudits(`https://${ws.domain}/`)]);
  const byUrl = new Map((audits.latest?.pages ?? []).map((p) => [normUrl(p.url), p]));
  const out: Record<string, number> = {};
  for (const row of ws.rows) {
    if (!row.url) continue;
    const kws = topicKeywords(row.clusterId, row.primaryKeyword, ctx.keywords.keywords, ws);
    const check = row.pageCheck && row.pageCheck.url === row.url ? row.pageCheck : null;
    const fallback = byUrl.get(normUrl(row.url)) ?? null;
    out[row.clusterId] = pageFixes(row, keywordMap(row, kws, check, fallback), check, { brand: ctx.brand, place: ctx.place, questions: ctx.questions, fallback }).length;
  }
  return out;
}

/** Checks the live pages of several topics, 6 at a time, and saves once (bulk "Send fixes to approvals"). */
export async function refreshChecks(rawDomain: string, clusterIds: string[]): Promise<void> {
  const domain = normDomain(rawDomain);
  const [ws, ctx] = await Promise.all([getMapping(domain), mappingContext(domain)]);
  const due = ws.rows
    .filter((r) => clusterIds.includes(r.clusterId) && r.url)
    .map((r) => ({ r, terms: topicKeywords(r.clusterId, r.primaryKeyword, ctx.keywords.keywords, ws).map((k) => k.term) }))
    .filter((x) => needsCheck(x.r, x.terms));
  if (!due.length) return;
  const checks = new Map<string, Awaited<ReturnType<typeof fetchPageCheck>>>();
  for (let i = 0; i < due.length; i += 6) {
    await Promise.all(due.slice(i, i + 6).map(async (x) => checks.set(x.r.clusterId, await fetchPageCheck(x.r.url!, x.terms))));
  }
  let next = await getMapping(domain);
  for (const [id, check] of checks) if (check) next = updateMappingRow(next, id, { pageCheck: check });
  await saveMapping(next);
}
