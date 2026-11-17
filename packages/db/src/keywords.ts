import type { KeywordWorkspace } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Module 4 workspaces in Postgres (one JSON document per website). */
export async function getKeywordWorkspace(domain: string): Promise<KeywordWorkspace | null> {
  const row = await prisma.keywordWorkspace.findUnique({ where: { domain } });
  return row ? (row.data as unknown as KeywordWorkspace) : null;
}

export async function saveKeywordWorkspace(ws: KeywordWorkspace): Promise<void> {
  const data = ws as unknown as Prisma.InputJsonValue;
  const lastRunAt = ws.lastRunAt ? new Date(ws.lastRunAt) : null;
  await prisma.keywordWorkspace.upsert({ where: { domain: ws.domain }, create: { domain: ws.domain, data, lastRunAt }, update: { data, lastRunAt } });
}
