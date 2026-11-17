import 'server-only';
import { executeAudit, type AiCache, type NewAuditInput } from '@seo/core';
import { enqueueAudit } from '@seo/db/queue';
import { createAudit, getAudit, saveAudit, usingDatabase, type AuditRecord } from './audit-store';
import { providerConfig } from './providers-config';
import { emailReportIfRequested } from './notify';
import { appSettings } from './settings';

/**
 * Starts audits. With USE_WORKER=1 (plus Postgres and Redis) each audit becomes a
 * BullMQ job that apps/worker runs, so audits survive web restarts and redeploys.
 * Otherwise it runs inside this process (local development, or before a worker exists).
 */
const running = ((globalThis as { __auditJobs?: Set<string> }).__auditJobs ??= new Set<string>());

/**
 * Per-run settings for in-process audits (the worker reads the same ones). Search Console:
 * customer audits use the customer's own Google connection and chosen property.
 */
async function runSettings(record: AuditRecord) {
  const s = await appSettings();
  const db = usingDatabase() ? await import('@seo/db') : null;
  const cache = db ? db.dbAiCache : memoryAiCache;
  const access = db ? await db.auditGscAccess(record) : {};
  if (access.property && !record.input.gscProperty) record.input = { ...record.input, gscProperty: access.property };
  return {
    gsc: access.gsc,
    maxTemplates: s['lighthouse.maxTemplates'],
    aiChecks: s['ai.checks'] ? { maxPages: s['ai.maxPages'], maxTokens: s['ai.maxTokens'], cache } : undefined,
  };
}

/** Without a database, AI results are cached for the life of this process. */
const memoryStore = new Map<string, unknown>();
const memoryAiCache: AiCache = { get: async (k) => memoryStore.get(k), set: async (k, v) => void memoryStore.set(k, v) };

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
  void executeAudit(record, { ...env, ...(await runSettings(record)) }, saveAudit)
    .then(() => emailReportIfRequested(record))
    .finally(() => running.delete(record.id));
  return record;
}

/**
 * Runs a failed audit again in place: same id, address and settings, so links and the
 * project history stay intact. The run starts clean (executeAudit resets the record).
 */
export async function retryAudit(id: string): Promise<boolean> {
  const { env } = providerConfig();
  if (!env) throw new ConfigError('DataForSEO login and password are missing from the server environment.');
  const record = await getAudit(id);
  if (!record || record.status !== 'failed' || running.has(id)) return false;
  // A retry is a fresh run: the timer and the report's duration start now.
  Object.assign(record, { status: 'running', progress: 0, error: undefined, finishedAt: undefined, createdAt: new Date().toISOString() });
  for (const s of record.steps) Object.assign(s, { state: 'queued', detail: undefined, startedAt: undefined, finishedAt: undefined });
  await saveAudit(record);
  if (workerMode()) {
    await enqueueAudit(record.id, Date.now());
    return true;
  }
  running.add(record.id);
  void executeAudit(record, { ...env, ...(await runSettings(record)) }, saveAudit)
    .then(() => emailReportIfRequested(record))
    .finally(() => running.delete(record.id));
  return true;
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
