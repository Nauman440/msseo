/** Shared HTTP helper for every provider: timeout, retries with backoff, and a log hook. */

export type HttpLog = (event: { provider: string; url: string; status?: number; ms: number; attempt: number; error?: string }) => void;

export type RequestOptions = {
  provider: string;
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  log?: HttpLog;
  /** Do not follow redirects (used to read redirect targets). */
  manualRedirect?: boolean;
};

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function request(url: string, opts: RequestOptions): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: {
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        redirect: opts.manualRedirect ? 'manual' : 'follow',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      opts.log?.({ provider: opts.provider, url, status: res.status, ms: Date.now() - started, attempt });
      if (RETRYABLE.has(res.status) && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      opts.log?.({ provider: opts.provider, url, ms: Date.now() - started, attempt, error: String(err) });
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function requestJson<T>(url: string, opts: RequestOptions): Promise<T> {
  const res = await request(url, opts);
  const text = await res.text();
  if (!res.ok) throw new HttpError(`${opts.provider} ${res.status} for ${url}`, res.status, text.slice(0, 500));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`${opts.provider} returned invalid JSON`, res.status, text.slice(0, 500));
  }
}
