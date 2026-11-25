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
/** Module 3.9: competitor refresh on the 1st of Jan, Apr, Jul and Oct, 07:00 UTC. */
export const QUARTERLY_COMPETITORS = 'quarterly-competitors';

/** Autopilot (customers): daily check for websites due their monthly run, 05:00 UTC. */
export const DAILY_AUTOPILOT = 'daily-autopilot';
/** Autopilot right after a customer finishes sign-up or adds a website (data: { userId }). */
export const AUTOPILOT_CUSTOMER = 'autopilot-customer';
/** Module 12: daily check of finished actions due their 7/14/28-day verification, 08:00 UTC. */
export const DAILY_ACTION_CHECKS = 'daily-action-checks';
/** Module 10: weekly AI search tracking for customer websites, Mondays 07:30 UTC. */
export const WEEKLY_AI_TRACKING = 'weekly-ai-tracking';
/** Module 13: daily alerts (06:15 UTC), weekly snapshots (Mondays 10:00 UTC), monthly reports (1st, 11:00 UTC). */
export const DAILY_MONITOR = 'daily-monitor';
export const WEEKLY_MONITOR = 'weekly-monitor';
export const MONTHLY_REPORTS = 'monthly-reports';
/** Autopilot phase 1: reads every connected WordPress site's pages again (Sundays). */
export const WEEKLY_WP_INVENTORY = 'weekly-wp-inventory';

/** Queues an autopilot run for one customer (deduplicated for 10 minutes), after `delayMs` (lets the first audit finish). */
export async function enqueueAutopilot(userId: string, delayMs = 0): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  const queue = new Queue(SCHEDULE_QUEUE, { connection: redisConnection(url) });
  try {
    await queue.add(AUTOPILOT_CUSTOMER, { userId }, { jobId: `autopilot-${userId}-${Math.floor(Date.now() / 600_000)}`, delay: delayMs, removeOnComplete: 100, removeOnFail: 100 });
  } finally {
    await queue.close();
  }
}

/** Creates or updates the weekly schedule (idempotent; called when the worker starts). */
export async function ensureWeeklySchedule(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  const queue = new Queue(SCHEDULE_QUEUE, { connection: redisConnection(url) });
  try {
    await queue.upsertJobScheduler(WEEKLY_CUSTOMER_AUDITS, { pattern: '0 6 * * 1', tz: 'UTC' }, { name: WEEKLY_CUSTOMER_AUDITS });
    await queue.upsertJobScheduler(QUARTERLY_COMPETITORS, { pattern: '0 7 1 1,4,7,10 *', tz: 'UTC' }, { name: QUARTERLY_COMPETITORS });
    await queue.upsertJobScheduler(DAILY_AUTOPILOT, { pattern: '0 5 * * *', tz: 'UTC' }, { name: DAILY_AUTOPILOT });
    await queue.upsertJobScheduler(DAILY_ACTION_CHECKS, { pattern: '0 8 * * *', tz: 'UTC' }, { name: DAILY_ACTION_CHECKS });
    await queue.upsertJobScheduler(DAILY_MONITOR, { pattern: '15 6 * * *', tz: 'UTC' }, { name: DAILY_MONITOR });
    await queue.upsertJobScheduler(WEEKLY_MONITOR, { pattern: '0 10 * * 1', tz: 'UTC' }, { name: WEEKLY_MONITOR });
    await queue.upsertJobScheduler(MONTHLY_REPORTS, { pattern: '0 11 1 * *', tz: 'UTC' }, { name: MONTHLY_REPORTS });
    await queue.upsertJobScheduler(WEEKLY_AI_TRACKING, { pattern: '30 7 * * 1', tz: 'UTC' }, { name: WEEKLY_AI_TRACKING });
    await queue.upsertJobScheduler(WEEKLY_WP_INVENTORY, { pattern: '20 4 * * 0', tz: 'UTC' }, { name: WEEKLY_WP_INVENTORY });
  } finally {
    await queue.close();
  }
}
