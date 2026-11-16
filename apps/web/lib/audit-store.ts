import 'server-only';
import { randomUUID } from 'node:crypto';
import { AUDIT_STEPS, type NewAuditInput } from '@seo/core';
import * as dbStore from './store-db';
import * as fileStore from './store-file';
import type { AuditRecord } from './store-file';

/**
 * Audit storage. Postgres (Prisma) when DATABASE_URL is set, which is always the case
 * on the server; otherwise JSON files in .data/audits, so tests and machines without a
 * database keep working. Callers never need to know which one is active.
 */
export type { AuditRecord } from './store-file';

export const usingDatabase = () => Boolean(process.env.DATABASE_URL);

export async function createAudit(input: NewAuditInput): Promise<AuditRecord> {
  const record: AuditRecord = {
    id: randomUUID(),
    input,
    status: 'running',
    progress: 0,
    steps: AUDIT_STEPS.map((s) => ({ id: s.id, label: s.label, state: 'queued' })),
    createdAt: new Date().toISOString(),
  };
  await (usingDatabase() ? dbStore.createAudit(record) : fileStore.saveAudit(record));
  return record;
}

export const saveAudit = (record: AuditRecord) => (usingDatabase() ? dbStore.saveAudit(record) : fileStore.saveAudit(record));
export const getAudit = (id: string) => (usingDatabase() ? dbStore.getAudit(id) : fileStore.getAudit(id));
export const listAudits = (limit?: number) => (usingDatabase() ? dbStore.listAudits(limit) : fileStore.listAudits(limit));

/** Projects (client domains) with audit counts; null without a database. */
export const listProjects = (limit?: number) => (usingDatabase() ? dbStore.listProjects(limit) : Promise.resolve(null));
