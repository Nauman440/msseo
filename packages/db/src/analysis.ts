import type { CompetitorAnalysis } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Module 6: the latest deep competitor analysis per website, in Postgres. */
export async function getCompetitorAnalysis(domain: string): Promise<CompetitorAnalysis | null> {
  const row = await prisma.competitorAnalysis.findUnique({ where: { domain } });
  return row ? (row.data as unknown as CompetitorAnalysis) : null;
}

export async function saveCompetitorAnalysis(a: CompetitorAnalysis): Promise<void> {
  const data = a as unknown as Prisma.InputJsonValue;
  await prisma.competitorAnalysis.upsert({ where: { domain: a.domain }, create: { domain: a.domain, data }, update: { data } });
}
