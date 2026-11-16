import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Audit job queue (BullMQ on Redis). apps/web adds one job per audit; apps/worker
 * runs them. The job id is the audit id, so an audit can never be queued twice. If a
 * worker dies mid-audit, BullMQ marks the job stalled and hands it to a worker again.
 */
export const AUDIT_QUEUE = 'audits';
export type AuditJobData = { auditId: string };

/** BullMQ needs `maxRetriesPerRequest: null` on its connections. */
export const redisConnection = (url: string) => new Redis(url, { maxRetriesPerRequest: null });

const g = globalThis as unknown as { __auditQueue?: Queue<AuditJobData> };

function auditQueue(): Queue<AuditJobData> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  g.__auditQueue ??= new Queue<AuditJobData>(AUDIT_QUEUE, { connection: redisConnection(url) });
  return g.__auditQueue;
}

/** `attempt` > 0 for a retry: BullMQ ignores a job id it still holds, so retries get their own. */
export async function enqueueAudit(auditId: string, attempt = 0): Promise<void> {
  const jobId = attempt ? `${auditId}-retry-${attempt}` : auditId;
  await auditQueue().add('audit', { auditId }, { jobId, removeOnComplete: 1000, removeOnFail: 1000 });
}

/** Workers currently connected to the audit queue (for /api/health). */
export async function auditWorkerCount(): Promise<number> {
  return auditQueue().getWorkersCount();
}

/** Scheduled jobs (step 8): the weekly customer re-audit, Mondays 06:00 UTC. */
export const SCHEDULE_QUEUE = 'schedules';
export const WEEKLY_CUSTOMER_AUDITS = 'weekly-customer-audits';

/** Creates or updates the weekly schedule (idempotent; called when the worker starts). */
export async function ensureWeeklySchedule(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  const queue = new Queue(SCHEDULE_QUEUE, { connection: redisConnection(url) });
  try {
    await queue.upsertJobScheduler(WEEKLY_CUSTOMER_AUDITS, { pattern: '0 6 * * 1', tz: 'UTC' }, { name: WEEKLY_CUSTOMER_AUDITS });
  } finally {
    await queue.close();
  }
}
