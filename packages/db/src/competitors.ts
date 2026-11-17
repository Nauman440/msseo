import type { CompetitorWorkspace } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Module 3 workspaces in Postgres (one JSON document per website). */
export async function getCompetitorWorkspace(domain: string): Promise<CompetitorWorkspace | null> {
  const row = await prisma.competitorWorkspace.findUnique({ where: { domain } });
  return row ? (row.data as unknown as CompetitorWorkspace) : null;
}

export async function saveCompetitorWorkspace(ws: CompetitorWorkspace): Promise<void> {
  const data = ws as unknown as Prisma.InputJsonValue;
  const lastRunAt = ws.lastRunAt ? new Date(ws.lastRunAt) : null;
  await prisma.competitorWorkspace.upsert({ where: { domain: ws.domain }, create: { domain: ws.domain, data, lastRunAt }, update: { data, lastRunAt } });
}

/** 3.9 Quarterly refresh: workspaces that ran before and not in the last ~3 months. */
export async function dueCompetitorWorkspaces(now = new Date()): Promise<CompetitorWorkspace[]> {
  const cutoff = new Date(now.getTime() - 85 * 86_400_000);
  const rows = await prisma.competitorWorkspace.findMany({ where: { lastRunAt: { lt: cutoff } } });
  return rows.map((r) => r.data as unknown as CompetitorWorkspace);
}

/** Emails of customers who own a website on this domain (for the "new competitor" alert). */
export async function customerEmailsForDomain(domain: string): Promise<string[]> {
  const rows = await prisma.customerAccount.findMany({ where: { status: { not: 'cancelled' } }, select: { website: true, extraWebsites: true, user: { select: { email: true, active: true } } } });
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www./, '').toLowerCase();
    } catch {
      return '';
    }
  };
  return rows.filter((r) => r.user.active && [r.website, ...r.extraWebsites].some((w) => w && host(w) === domain)).map((r) => r.user.email);
}

/** Records the cost of a competitor run (no audit attached). */
export async function logCompetitorUsage(calls: number, costUsd: number): Promise<void> {
  if (calls) await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: 'calls', units: calls, costUsd } });
}
