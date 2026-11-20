import 'server-only';

/**
 * Click-free customer pages: a section with no data yet is prepared in the background of this
 * server the first time it is opened, and the page shows "Preparing…" and refreshes until it is
 * ready. One run per key at a time; after a run, the same key waits `cooldownMs` before it may run
 * again (so a run that ended with "not switched on" or "budget used up" is not retried on every
 * visit). Paid runs keep their own monthly limits and the autopilot cap.
 */
const running = new Map<string, Promise<void>>();
const lastRun = new Map<string, number>();
const DAY = 86_400_000;

export function isPreparing(key: string): boolean {
  return running.has(key);
}

/** Starts `run` in the background unless it is running or ran within the cooldown. True while it runs. */
export function prepare(key: string, run: () => Promise<unknown>, cooldownMs = DAY): boolean {
  if (running.has(key)) return true;
  const last = lastRun.get(key);
  if (last && Date.now() - last < cooldownMs) return false;
  lastRun.set(key, Date.now());
  const p = Promise.resolve()
    .then(run)
    .then(() => undefined)
    .catch((err: unknown) => console.error(`[auto] ${key}: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => running.delete(key));
  running.set(key, p);
  return true;
}

/** Stale after this many days: free sections (content, tracking) are refreshed on the next visit. */
export const isOlderThan = (iso: string | null | undefined, days: number) => !iso || Date.now() - Date.parse(iso) > days * DAY;
