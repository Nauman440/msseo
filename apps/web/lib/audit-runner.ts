import 'server-only';
import { executeAudit, type NewAuditInput } from '@seo/core';
import { enqueueAudit } from '@seo/db/queue';
import { createAudit, getAudit, saveAudit, usingDatabase, type AuditRecord } from './audit-store';
import { providerConfig } from './providers-config';

/**
 * Starts audits. With USE_WORKER=1 (plus Postgres and Redis) each audit becomes a
 * BullMQ job that apps/worker runs, so audits survive web restarts and redeploys.
 * Otherwise it runs inside this process (local development, or before a worker exists).
 */
const running = ((globalThis as { __auditJobs?: Set<string> }).__auditJobs ??= new Set<string>());

export const workerMode = () => process.env.USE_WORKER === '1' && Boolean(process.env.REDIS_URL) && usingDatabase();

export class ConfigError extends Error {}

export async function startAudit(input: NewAuditInput, createdById?: string | null): Promise<AuditRecord> {
  const { env } = providerConfig();
  if (!env) throw new ConfigError('DataForSEO login and password are missing from the server environment.');

  const record = await createAudit(input, createdById);
  if (workerMode()) {
    await enqueueAudit(record.id);
    return record;
  }
  running.add(record.id);
  void executeAudit(record, env, saveAudit).finally(() => running.delete(record.id));
  return record;
}

/** Whether the audit is still being worked on (in worker mode the worker owns that, so yes). */
export const isAuditActive = (id: string) => workerMode() || running.has(id);

/** In-process mode: an audit left running by a restart is reported as interrupted. */
export async function getAuditStatus(id: string): Promise<AuditRecord | null> {
  const record = await getAudit(id);
  if (!record || workerMode() || running.has(id)) return record;
  // AI recommendations were still being written when the app restarted: stop waiting.
  if (record.status === 'completed' && record.report?.aiPending) {
    record.report = { ...record.report, aiPending: false };
    await saveAudit(record);
  }
  if (record.status === 'running') {
    record.status = 'failed';
    record.error = 'The audit was interrupted (the app restarted). Please run it again.';
    await saveAudit(record);
  }
  return record;
}
