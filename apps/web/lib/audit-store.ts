import 'server-only';
import { newAuditRecord, type AuditRecord, type NewAuditInput } from '@seo/core';
import * as dbStore from './store-db';
import * as fileStore from './store-file';

/**
 * Audit storage. Postgres (Prisma, shared with apps/worker) when DATABASE_URL is set,
 * which is always the case on the server; otherwise JSON files in .data/audits, so
 * tests and machines without a database keep working.
 */
export type { AuditRecord } from '@seo/core';

export const usingDatabase = () => Boolean(process.env.DATABASE_URL);

export async function createAudit(input: NewAuditInput, createdById?: string | null): Promise<AuditRecord> {
  const record = newAuditRecord(input, createdById);
  await (usingDatabase() ? dbStore.createAudit(record) : fileStore.saveAudit(record));
  return record;
}

export const saveAudit = (record: AuditRecord) => (usingDatabase() ? dbStore.saveAudit(record) : fileStore.saveAudit(record));
export const getAudit = (id: string) => (usingDatabase() ? dbStore.getAudit(id) : fileStore.getAudit(id));
export const listAudits = (limit?: number) => (usingDatabase() ? dbStore.listAudits(limit) : fileStore.listAudits(limit));

/** Projects (client domains) with audit counts; null without a database. */
export const listProjects = (limit?: number) => (usingDatabase() ? dbStore.listProjects(limit) : Promise.resolve(null));

/** Free (public) audits started since `since`, for the daily spending cap (step 8). */
export async function countPublicAuditsSince(since: Date): Promise<number> {
  if (usingDatabase()) {
    const { prisma } = await import('@seo/db');
    return prisma.audit.count({ where: { source: 'public', createdAt: { gte: since } } });
  }
  return (await fileStore.listAudits(5000)).filter((r) => r.input.source === 'public' && Date.parse(r.createdAt) >= since.getTime()).length;
}
