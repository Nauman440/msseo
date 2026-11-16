import { Worker } from 'bullmq';
import pino from 'pino';
import { executeAudit, providerConfig } from '@seo/core';
import { getAuditRecord, getSettings, gscAuditAccess, gscSetup, prisma, saveAuditRecord } from '@seo/db';
import { AUDIT_QUEUE, redisConnection, type AuditJobData } from '@seo/db/queue';

/**
 * Audit worker (spec §5.3): runs the audits apps/web queues, with the same
 * executeAudit() the web app uses in-process, saving progress to Postgres.
 * If this process dies mid-audit, BullMQ hands the stalled job to a worker again.
 */
const log = pino({ name: 'worker' });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl || !process.env.DATABASE_URL) {
  log.fatal('REDIS_URL and DATABASE_URL must both be set');
  process.exit(1);
}

const connection = redisConnection(redisUrl);
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
const gsc = gscSetup();
if (!gsc.ready) log.warn({ missing: gsc.missing }, 'Search Console checks disabled in the worker');

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE,
  async (job) => {
    const { env } = providerConfig();
    if (!env) throw new Error('DataForSEO login and password are missing from the worker environment');
    const record = await getAuditRecord(job.data.auditId);
    if (!record) {
      log.warn({ auditId: job.data.auditId }, 'audit no longer exists; skipping');
      return;
    }
    log.info({ auditId: record.id, url: record.input.url, mode: record.input.auditMode, attempt: job.attemptsMade + 1 }, 'audit started');
    const http = (e: { provider: string; url: string; status?: number; ms: number; attempt: number; error?: string }) => log.debug(e, 'http');
    const settings = await getSettings();
    await executeAudit(record, { ...env, gsc: gscAuditAccess(), maxTemplates: settings['lighthouse.maxTemplates'], log: http }, saveAuditRecord);
    log.info({ auditId: record.id, status: record.status, score: record.report?.overall.score, error: record.error }, 'audit finished');
  },
  // Audits take a minute or two; renew the lock often enough that a busy process is not
  // mistaken for a dead one, and retry a stalled job once.
  { connection, concurrency, lockDuration: 120_000, maxStalledCount: 1 },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'audit job failed'));
worker.on('error', (err) => log.error({ err }, 'worker error'));

const shutdown = async () => {
  log.info('shutting down');
  await worker.close(); // waits for running audits to finish their current step
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log.info({ concurrency }, 'worker started');
