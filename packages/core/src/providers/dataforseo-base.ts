import { z } from 'zod';
import type { DfsConfig } from './dataforseo-competitors';
import { HttpError, requestJson } from './http';
import { siteHost } from '../site-key';

/**
 * Shared DataForSEO calls (docs.dataforseo.com, checked 2026-11-19): one task per Live call; Standard
 * calls are task_post → task_get/$id. Status codes from the errors appendix: 20000 ok, 40102 no
 * results, 40601 task handed / 40602 task in queue (not ready yet), 40204 the API is not enabled on
 * the account (Plans and Subscriptions), 40200/40210 payment needed.
 */
export class DfsAccessError extends Error {
  constructor(readonly api: string) {
    super(`The DataForSEO ${api} API is not enabled on this account (Plans and Subscriptions).`);
  }
}

const result = z.object({ items: z.array(z.unknown()).nullable().optional() }).passthrough();
const envelope = z.object({
  status_code: z.number(),
  status_message: z.string(),
  cost: z.number().optional(),
  tasks: z.array(z.object({ id: z.string().optional(), status_code: z.number(), status_message: z.string(), cost: z.number().optional(), result: z.array(result).nullable().optional() }).passthrough()).default([]),
});
export type DfsResult = z.infer<typeof result>;

/**
 * DataForSEO knows websites by host. A website in a folder has a site key "host~folder" (see
 * `siteKey()`); every target in a request is sent as its host, so such a key never reaches the API.
 */
export function hostTargets<T>(task: T): T {
  if (!task || typeof task !== 'object') return task;
  const t = { ...(task as Record<string, unknown>) };
  const host = (v: unknown) => (typeof v === 'string' && v.includes('~') ? siteHost(v) : v);
  if ('target' in t) t.target = host(t.target);
  for (const k of ['targets', 'exclude_targets'] as const) {
    const v = t[k];
    if (Array.isArray(v)) t[k] = v.map(host);
    else if (v && typeof v === 'object') t[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([a, b]) => [a, host(b)]));
  }
  if (typeof t.keyword === 'string' && t.keyword.startsWith('site:')) t.keyword = `site:${host(t.keyword.slice(5))}`;
  return t as T;
}

export function createDfsBase(cfg: DfsConfig, api: string) {
  const auth = `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`;
  const base = cfg.baseUrl.replace(/\/$/, '');
  const call = async (path: string, task?: Record<string, unknown>, timeoutMs = 60_000) => {
    const json = await requestJson<unknown>(`${base}${path}`, {
      provider: 'dataforseo',
      method: task ? 'POST' : 'GET',
      headers: { authorization: auth },
      ...(task ? { body: [hostTargets(task)] } : {}),
      timeoutMs,
      retries: 0,
      log: cfg.log,
    });
    const parsed = envelope.parse(json);
    if (parsed.status_code === 40204) throw new DfsAccessError(api);
    if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
    const t = parsed.tasks[0];
    if (!t) throw new HttpError('DataForSEO returned no task', 0);
    if (t.status_code === 40204) throw new DfsAccessError(api);
    return { task: t, cost: parsed.cost ?? 0 };
  };

  return {
    /** A Live call: the first result object (null when there are no results). */
    async live(path: string, task: Record<string, unknown>, timeoutMs = 60_000): Promise<{ result: DfsResult | null; items: unknown[]; cost: number }> {
      const { task: t, cost } = await call(path, task, timeoutMs);
      if (t.status_code === 40102) return { result: null, items: [], cost };
      if (t.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
      const r = t.result?.[0] ?? null;
      return { result: r, items: r?.items ?? [], cost };
    },
    /** Sets a Standard task; returns its id. */
    async post(path: string, task: Record<string, unknown>): Promise<{ id: string; cost: number }> {
      const { task: t, cost } = await call(path, task);
      if (t.status_code >= 40000 || !t.id) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
      return { id: t.id, cost };
    },
    /** Reads a Standard task: ready = false while it is handed or queued (40601 / 40602). */
    async get(path: string, id: string): Promise<{ ready: boolean; result: DfsResult | null; items: unknown[] }> {
      const { task: t } = await call(`${path}/${encodeURIComponent(id)}`);
      if (t.status_code === 40601 || t.status_code === 40602) return { ready: false, result: null, items: [] };
      if (t.status_code === 40102) return { ready: true, result: null, items: [] };
      if (t.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${t.status_message}`, t.status_code);
      const r = t.result?.[0] ?? null;
      return { ready: true, result: r, items: r?.items ?? [] };
    },
  };
}
export type DfsBase = ReturnType<typeof createDfsBase>;
