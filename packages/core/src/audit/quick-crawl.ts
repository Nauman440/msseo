import type { DataForSeoClient, OnPagePage } from '../providers/dataforseo';
import type { Discovery } from '../providers/direct-fetch';
import type { AudienceText } from '../types';
import { BROWSER_UA, type CrawlProgress, type CrawlResult } from './deep-crawl';

/**
 * Quick mode: live per-page checks (DataForSEO Instant Pages), run in parallel.
 * About 10–20 s for 10 pages instead of a 1–3 min queued crawl. No link graph, so
 * crawl-only rules (depth, orphans, near-duplicate content) are skipped.
 */

const CONCURRENCY = 10;
// Responses that usually mean a firewall/CDN blocked DataForSEO's crawler user agent.
const BLOCKED = new Set([401, 403, 406, 429, 503]);

const key = (u: string) => {
  const url = new URL(u);
  url.hash = '';
  return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '') || '/'}${url.search}`;
};

/** Homepage first, then its links, then sitemap URLs: same site only, no duplicates. */
export function pickPages(discovery: Discovery, limit: number): string[] {
  const host = new URL(discovery.homepage.finalUrl).hostname.replace(/^www\./, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [discovery.homepage.finalUrl, ...discovery.candidates]) {
    try {
      if (new URL(u).hostname.replace(/^www\./, '') !== host || seen.has(key(u))) continue;
      seen.add(key(u));
      out.push(u);
    } catch {
      // skip malformed URLs
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** The crawl flags duplicates across the whole site; quick mode compares the pages it checked. */
export function markDuplicates(pages: OnPagePage[]): void {
  const ok = pages.filter((p) => p.resource_type === 'html' && p.status_code === 200);
  for (const field of ['title', 'description'] as const) {
    const counts = new Map<string, number>();
    const norm = (p: OnPagePage) => p.meta?.[field]?.trim().toLowerCase() || '';
    for (const p of ok) if (norm(p)) counts.set(norm(p), (counts.get(norm(p)) ?? 0) + 1);
    for (const p of ok) {
      const dup = !!norm(p) && (counts.get(norm(p)) ?? 0) > 1;
      if (field === 'title') p.duplicate_title = dup;
      else p.duplicate_description = dup;
    }
  }
}

export async function quickCrawl(
  client: DataForSeoClient,
  discovery: Discovery,
  opts: { pageLimit: number; jsRendering: boolean },
  progress: CrawlProgress,
): Promise<CrawlResult> {
  const urls = pickPages(discovery, opts.pageLimit);
  const pages: OnPagePage[] = [];
  let cost = 0;
  let done = 0;
  let retried = 0;

  const checkOne = async (url: string) => {
    const attempt = async (ua?: string) => {
      try {
        const r = await client.instantPage(url, { enableJavascript: opts.jsRendering, customUserAgent: ua });
        cost += r.cost;
        return r.page;
      } catch {
        return null;
      }
    };
    let page = await attempt();
    if (!page || BLOCKED.has(page.status_code)) {
      retried++;
      page = (await attempt(BROWSER_UA)) ?? page;
    }
    if (page) pages.push(page);
    done++;
    progress(done / urls.length, `${done} of ${urls.length} pages checked`);
  };

  // Simple worker pool: at most CONCURRENCY pages in flight.
  const queue = [...urls];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) await checkOne(url);
  }));

  markDuplicates(pages);
  const htmlCount = pages.filter((p) => p.resource_type === 'html').length;
  const host = new URL(discovery.homepage.finalUrl).hostname;
  const notices: AudienceText[] = [
    htmlCount === 0
      ? {
          client: `We could not read the pages of ${host}, so page-by-page checks are missing from this report. Try a deep crawl, or fix the issues below first.`,
          expert: `Instant Pages returned no HTML for ${urls.length} URLs (${retried} retried with a browser user agent). Page-scope rules were skipped.`,
        }
      : {
          client: `This quick audit checked ${htmlCount} key pages. Run a deep crawl for full link analysis (click depth, orphan pages and copied content).`,
          expert: `Quick audit: ${htmlCount} pages via Instant Pages (homepage links, then sitemap). Skipped crawl-only checks: 1.5.5, 1.12.1, 1.12.2, 2.4.7. Duplicate titles/descriptions compared within the sample.`,
        },
  ];
  return { summary: null, pages, cost, notices, detail: `${htmlCount} pages checked` };
}
