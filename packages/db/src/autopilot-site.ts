import { prisma, type Prisma } from './client';

/** WordPress autopilot state per account and website (work items + runs). Every query names both. */
export async function getAutopilotSite<T>(accountId: string, domain: string): Promise<T | null> {
  const row = await prisma.wpAutopilot.findUnique({ where: { accountId_domain: { accountId, domain } } });
  return row ? (row.data as unknown as T) : null;
}

export async function saveAutopilotSite(accountId: string, domain: string, data: unknown): Promise<void> {
  const json = data as Prisma.InputJsonValue;
  await prisma.wpAutopilot.upsert({ where: { accountId_domain: { accountId, domain } }, create: { accountId, domain, data: json }, update: { data: json } });
}
