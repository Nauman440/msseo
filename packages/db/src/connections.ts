import type { SiteConnection } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Site connections in Postgres (spec §16.5): one JSON document per website, credentials encrypted inside. */
export async function getSiteConnection(domain: string): Promise<SiteConnection | null> {
  const row = await prisma.siteConnection.findUnique({ where: { domain } });
  return row ? (row.data as unknown as SiteConnection) : null;
}

export async function saveSiteConnection(c: SiteConnection): Promise<void> {
  const data = c as unknown as Prisma.InputJsonValue;
  await prisma.siteConnection.upsert({ where: { domain: c.domain }, create: { domain: c.domain, data }, update: { data } });
}

export async function deleteSiteConnection(domain: string): Promise<void> {
  await prisma.siteConnection.deleteMany({ where: { domain } });
}

/** Every connected site (for the worker's weekly jobs). */
export async function listSiteConnections(): Promise<SiteConnection[]> {
  const rows = await prisma.siteConnection.findMany();
  return rows.map((r) => r.data as unknown as SiteConnection);
}
