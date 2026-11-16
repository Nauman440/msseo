import { request, type HttpLog } from '../providers/http';
import type { PageContent } from './page-content';

/**
 * Status of the links found on the audited pages (rules 1.5.7, 1.12.5, 2.6.4).
 * HEAD first, GET when a server refuses HEAD. `status` 0 = timeout or refused,
 * -1 = the domain does not exist (a dead external site).
 */
export type LinkCheck = { url: string; internal: boolean; status: number; from: string[] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MAX_INTERNAL = 60;
const MAX_EXTERNAL = 40;
/** Stop starting new checks after this, so link checking never holds a quick audit up. */
const BUDGET_MS = 15_000;
const SKIP = /\.(jpe?g|png|gif|webp|avif|svg|pdf|zip|mp4|mp3|docx?|xlsx?)(\?|$)|\/cdn-cgi\/|\/wp-admin\/|\/wp-login|\/cart|\/checkout|\/logout/i;
/** Social networks block automated requests; their status says nothing about the link. */
const BOT_WALLED = /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|pinterest|yelp)\.com$/i;

/** A link that is really broken (not just unfriendly to bots). */
export const isBroken = (l: LinkCheck) => l.status === 404 || l.status === 410 || l.status === -1 || (l.internal && l.status >= 500);

async function statusOf(url: string, log?: HttpLog): Promise<number> {
  const opts = { provider: 'site', headers: { 'user-agent': UA }, timeoutMs: 6_000, retries: 0, log };
  try {
    let res = await request(url, { ...opts, method: 'HEAD' });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await request(url, opts);
      await res.body?.cancel();
    }
    return res.status;
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    return code === 'ENOTFOUND' ? -1 : 0;
  }
}

/** Checks links not already known from the crawl, 10 at a time, within a 15 s budget (unchecked links are left out). */
export async function checkLinks(content: PageContent[], known: Map<string, number>, log?: HttpLog): Promise<LinkCheck[]> {
  const found = new Map<string, LinkCheck>();
  for (const c of content) {
    for (const l of c.links) {
      if (SKIP.test(l.href)) continue;
      const host = new URL(l.href).hostname;
      if (!l.internal && BOT_WALLED.test(host)) continue;
      const entry = found.get(l.href) ?? { url: l.href, internal: l.internal, status: known.get(l.href) ?? NaN, from: [] };
      if (!entry.from.includes(c.url)) entry.from.push(c.url);
      found.set(l.href, entry);
    }
  }
  const all = [...found.values()];
  const todo = [
    ...all.filter((l) => l.internal && Number.isNaN(l.status)).slice(0, MAX_INTERNAL),
    ...all.filter((l) => !l.internal).slice(0, MAX_EXTERNAL),
  ];
  const queue = [...todo];
  const deadline = Date.now() + BUDGET_MS;
  await Promise.all(
    Array.from({ length: Math.min(10, queue.length) }, async () => {
      for (let l = queue.shift(); l && Date.now() < deadline; l = queue.shift()) l.status = await statusOf(l.url, log);
    }),
  );
  return all.filter((l) => !Number.isNaN(l.status));
}
