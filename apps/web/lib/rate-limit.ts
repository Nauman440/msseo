import 'server-only';
import Redis from 'ioredis';

/**
 * Fixed-window rate limit (spec §4: login 5 attempts / 15 min per IP + email).
 * Redis when REDIS_URL is set, so limits hold across restarts and instances;
 * an in-memory map otherwise (dev/tests).
 */
const g = globalThis as unknown as { __rlRedis?: Redis; __rlMemory?: Map<string, { count: number; reset: number }> };

function redis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  g.__rlRedis ??= new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: false });
  return g.__rlRedis;
}

/** Records one attempt; returns whether it is allowed and how many seconds until the window resets. */
export async function hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const r = redis();
  if (r) {
    try {
      const k = `rl:${key}`;
      const [[, count], [, ttl]] = (await r.multi().incr(k).ttl(k).exec()) as [[null, number], [null, number]];
      if (ttl < 0) await r.expire(k, windowSec);
      return { allowed: count <= limit, retryAfter: ttl > 0 ? ttl : windowSec };
    } catch {
      // Redis unavailable: fall through to the in-memory limiter rather than locking everyone out.
    }
  }
  const mem = (g.__rlMemory ??= new Map());
  const now = Date.now();
  const entry = mem.get(key);
  if (!entry || entry.reset <= now) {
    mem.set(key, { count: 1, reset: now + windowSec * 1000 });
    return { allowed: true, retryAfter: windowSec };
  }
  entry.count++;
  return { allowed: entry.count <= limit, retryAfter: Math.ceil((entry.reset - now) / 1000) };
}

/** Clears a key (after a successful login). */
export async function clear(key: string): Promise<void> {
  g.__rlMemory?.delete(key);
  try {
    await redis()?.del(`rl:${key}`);
  } catch {
    // best effort
  }
}
