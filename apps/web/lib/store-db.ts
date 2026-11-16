import 'server-only';
import type { AuditRecord } from '@seo/core';
import { existingAuditIds, getAuditRecord, insertAuditRecord, listAuditRecords, listProjects as dbListProjects, saveAuditRecord } from '@seo/db';
import * as fileStore from './store-file';

/**
 * The web app's view of the Postgres store (shared with apps/worker in packages/db),
 * plus a one-time import of audits saved as JSON files before the move to Postgres.
 */

const importState = globalThis as unknown as { __auditImport?: Promise<void> };

/** Copies pre-database JSON audits into Postgres once; existing ids are skipped. */
function importFileAuditsOnce(): Promise<void> {
  importState.__auditImport ??= (async () => {
    try {
      const files = await fileStore.listAudits(10_000);
      if (!files.length) return;
      const existing = await existingAuditIds(files.map((f) => f.id));
      for (const r of files.filter((f) => !existing.has(f.id))) {
        // Interrupted runs from the file era cannot resume: keep them as failed.
        await insertAuditRecord(r.status === 'running' ? { ...r, status: 'failed', error: 'Interrupted before the move to the database.' } : r);
      }
    } catch (err) {
      importState.__auditImport = undefined; // retry on the next request
      throw err;
    }
  })();
  return importState.__auditImport;
}

export async function createAudit(record: AuditRecord): Promise<void> {
  await importFileAuditsOnce();
  await insertAuditRecord(record);
}

export const saveAudit = saveAuditRecord;

export async function getAudit(id: string): Promise<AuditRecord | null> {
  await importFileAuditsOnce();
  return getAuditRecord(id);
}

export async function listAudits(limit = 20): Promise<AuditRecord[]> {
  await importFileAuditsOnce();
  return listAuditRecords(limit);
}

export async function listProjects(limit = 50) {
  await importFileAuditsOnce();
  return dbListProjects(limit);
}
