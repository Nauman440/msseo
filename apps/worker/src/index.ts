import { Worker } from 'bullmq';
import pino from 'pino';
import { deliverReportEmail, emailConfig, executeAudit, providerConfig } from '@seo/core';
import { createWeeklyCustomerAudits, dbAiCache, dueCustomerSites, getAuditRecord, getSettings, auditGscAccess, gscSetup, pageKeywordsFor, prisma, saveAuditRecord } from '@seo/db';
import { AUDIT_QUEUE, ensureWeeklySchedule, enqueueAudit, QUARTERLY_COMPETITORS, redisConnection, SCHEDULE_QUEUE, WEEKLY_CUSTOMER_AUDITS, type AuditJobData } from '@seo/db/queue';
import { refreshCompetitors } from './competitors';
import { renderPdfBytes } from './pdf/render';

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
    const aiChecks = settings['ai.checks'] ? { maxPages: settings['ai.maxPages'], maxTokens: settings['ai.maxTokens'], cache: dbAiCache } : undefined;
    // Customer audits use the customer's own Google connection; team audits the agency one.
    const access = await auditGscAccess(record);
    if (access.property && !record.input.gscProperty) record.input = { ...record.input, gscProperty: access.property };
    // Module 5: keywords mapped to this site's pages feed the on-page rules.
    const pageKeywords = await pageKeywordsFor(record.input.url).catch(() => ({}));
    await executeAudit(record, { ...env, gsc: access.gsc, pageKeywords, maxTemplates: settings['lighthouse.maxTemplates'], aiChecks, log: http }, saveAuditRecord);
    log.info({ auditId: record.id, status: record.status, score: record.report?.overall.score, error: record.error }, 'audit finished');

    // "Email me the full report": never fails the job; the result is logged.
    if (record.status === 'completed' && record.input.notifyEmail) {
      const mail = emailConfig();
      if (!mail.ok) log.warn({ auditId: record.id, missing: mail.missing }, 'report email not sent: settings missing');
      else {
        try {
          const sent = await deliverReportEmail(record, { ...mail, renderPdf: renderPdfBytes, log: http });
          log.info({ auditId: record.id, emailId: sent.id }, 'report email sent');
        } catch (err) {
          log.error({ auditId: record.id, err: err instanceof Error ? err.message : String(err) }, 'report email failed');
        }
      }
    }
  },
  // Audits take a minute or two; renew the lock often enough that a busy process is not
  // mistaken for a dead one, and retry a stalled job once.
  { connection, concurrency, lockDuration: 120_000, maxStalledCount: 1 },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'audit job failed'));

// Weekly customer re-audit (step 8): one audit per due customer, queued like any other.
const scheduler = new Worker(
  SCHEDULE_QUEUE,
  async (job) => {
    if (job.name === QUARTERLY_COMPETITORS) {
      await refreshCompetitors(log);
      return;
    }
    if (job.name !== WEEKLY_CUSTOMER_AUDITS) return;
    const due = await dueCustomerSites();
    for (const account of due) {
      try {
        for (const id of await createWeeklyCustomerAudits(account)) await enqueueAudit(id);
      } catch (err) {
        log.error({ accountId: account.id, err: err instanceof Error ? err.message : String(err) }, 'weekly audit not queued');
      }
    }
    log.info({ customers: due.length }, 'weekly customer audits queued');
  },
  { connection, concurrency: 1 },
);
scheduler.on('error', (err) => log.error({ err }, 'scheduler error'));
ensureWeeklySchedule().catch((err: unknown) => log.error({ err: err instanceof Error ? err.message : String(err) }, 'weekly schedule not set'));
worker.on('error', (err) => log.error({ err }, 'worker error'));

const shutdown = async () => {
  log.info('shutting down');
  await Promise.all([worker.close(), scheduler.close()]); // running audits finish their current step
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log.info({ concurrency }, 'worker started');
