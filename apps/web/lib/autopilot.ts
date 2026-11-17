import 'server-only';
import { workerMode } from './audit-runner';
import { usingDatabase } from './audit-store';

/** 5 minutes: enough for the customer's first audit to finish, so the page plan has its pages. */
const FIRST_AUDIT_MS = 5 * 60_000;

/**
 * Starts autopilot for a customer (after sign-up or a new website): queued for the worker when
 * it runs, otherwise in the background of this process. Needs a database; never throws, and the
 * monthly cap and on/off switch are checked by the run itself.
 */
export async function startAutopilot(userId: string): Promise<void> {
  if (!usingDatabase()) return;
  try {
    if (workerMode()) {
      const { enqueueAutopilot } = await import('@seo/db/queue');
      await enqueueAutopilot(userId, FIRST_AUDIT_MS);
      return;
    }
    const { runAutopilotFor } = await import('@seo/db');
    setTimeout(() => void runAutopilotFor(userId).catch((err: unknown) => console.error(`[autopilot] ${err instanceof Error ? err.message : String(err)}`)), FIRST_AUDIT_MS);
  } catch (err) {
    console.error(`[autopilot] not started: ${err instanceof Error ? err.message : String(err)}`);
  }
}
