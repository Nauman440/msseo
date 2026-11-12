import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PIPELINE_STEPS, type AuditJobData } from './pipeline/steps';

const log = pino({ name: 'worker' });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  log.fatal('REDIS_URL is not set');
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const worker = new Worker<AuditJobData>(
  'audits',
  async (job) => {
    // Phase 1 replaces this loop with real step handlers and AuditStep checkpointing.
    for (const [index, step] of PIPELINE_STEPS.entries()) {
      log.info({ auditId: job.data.auditId, step }, 'step pending implementation');
      await job.updateProgress(Math.round(((index + 1) / PIPELINE_STEPS.length) * 100));
    }
  },
  { connection, concurrency },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'audit job failed'));

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log.info({ concurrency }, 'worker started');
