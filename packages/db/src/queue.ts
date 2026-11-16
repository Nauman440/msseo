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
