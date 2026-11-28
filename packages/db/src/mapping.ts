import { pageKeywordMap, pageRivalMap, type MappingWorkspace as Mapping } from '@seo/core';
import { getKeywordWorkspace } from './keywords';
import { prisma, type Prisma } from './client';
import { siteKey } from '@seo/core';

/** Module 5 workspaces in Postgres (one JSON document per website). */
export async function getMappingWorkspace(domain: string): Promise<Mapping | null> {
  const row = await prisma.mappingWorkspace.findUnique({ where: { domain } });
  return row ? (row.data as unknown as Mapping) : null;
}

export async function saveMappingWorkspace(ws: Mapping): Promise<void> {
  const data = ws as unknown as Prisma.InputJsonValue;
  await prisma.mappingWorkspace.upsert({ where: { domain: ws.domain }, create: { domain: ws.domain, data }, update: { data } });
}

/** A website's key (host, or host~folder for a website in a folder). */
const hostOf = (url: string) => siteKey(url);

/** Module 5 feeds Module 2: the mapped primary keyword per page of the audited website. */
export async function pageKeywordsFor(url: string): Promise<Record<string, string>> {
  const ws = await getMappingWorkspace(hostOf(url)).catch(() => null);
  return pageKeywordMap(ws);
}

/** Rule 2.4.1: the pages that rank for each mapped page's keyword (cached results from keyword research). */
export async function pageRivalsFor(url: string): Promise<Record<string, string[]>> {
  const domain = hostOf(url);
  const [ws, kw] = await Promise.all([getMappingWorkspace(domain).catch(() => null), getKeywordWorkspace(domain).catch(() => null)]);
  return pageRivalMap(ws, kw?.keywords ?? []);
}
