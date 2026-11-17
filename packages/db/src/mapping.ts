import { pageKeywordMap, type MappingWorkspace as Mapping } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Module 5 workspaces in Postgres (one JSON document per website). */
export async function getMappingWorkspace(domain: string): Promise<Mapping | null> {
  const row = await prisma.mappingWorkspace.findUnique({ where: { domain } });
  return row ? (row.data as unknown as Mapping) : null;
}

export async function saveMappingWorkspace(ws: Mapping): Promise<void> {
  const data = ws as unknown as Prisma.InputJsonValue;
  await prisma.mappingWorkspace.upsert({ where: { domain: ws.domain }, create: { domain: ws.domain, data }, update: { data } });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** Module 5 feeds Module 2: the mapped primary keyword per page of the audited website. */
export async function pageKeywordsFor(url: string): Promise<Record<string, string>> {
  const ws = await getMappingWorkspace(hostOf(url)).catch(() => null);
  return pageKeywordMap(ws);
}
