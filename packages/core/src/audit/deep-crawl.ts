import type { DataForSeoClient, OnPagePage, OnPageSummary } from '../providers/dataforseo';
import type { Preflight } from '../providers/direct-fetch';
import type { AudienceText } from '../types';

/** Deep mode: full DataForSEO crawl (link graph, depth, duplicates). 3–5 minutes. */

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export type CrawlProgress = (fraction: number, detail: string) => void;
export type CrawlResult = { summary: OnPageSummary | null; pages: OnPagePage[]; cost: number; notices: AudienceText[]; detail: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForCrawl(client: DataForSeoClient, id: string, timeoutMs: number, pollMs: number, progress: CrawlProgress) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summary = await client.summary(id);
    if (summary?.crawl_progress === 'finished') return summary;
    const crawled = summary?.crawl_status?.pages_crawled ?? 0;
    const max = summary?.crawl_status?.max_crawl_pages || 1;
    progress(Math.min(0.95, crawled / max), `${crawled} of ${max} pages`);
    await sleep(pollMs);
  }
  throw new Error('The crawl took too long and was stopped. Try a smaller page limit or a quick audit.');
}

export async function deepCrawl(
  client: DataForSeoClient,
  preflight: Preflight,
  opts: { pageLimit: number; jsRendering: boolean; timeoutMs?: number; pollMs?: number },
  progress: CrawlProgress,
): Promise<CrawlResult> {
  const finalUrl = preflight.homepage.finalUrl;
  type Attempt = { label: string; sitemapUrl?: string; browserUa?: boolean };
  const crawlOnce = async (a: Attempt) => {
    progress(0, a.label);
    const task = await client.startCrawl({
      target: new URL(finalUrl).hostname.replace(/^www\./, ''),
      startUrl: finalUrl,
      maxCrawlPages: opts.pageLimit,
      enableJavascript: opts.jsRendering,
      sitemapUrl: a.sitemapUrl,
      ...(a.browserUa ? { customUserAgent: BROWSER_UA, switchPool: true } : {}),
    });
    const summary = await waitForCrawl(client, task.id, opts.timeoutMs ?? 20 * 60_000, opts.pollMs ?? 3000, progress);
    const pages = (summary?.crawl_status?.pages_crawled ?? 0) > 0 ? await client.pages(task.id, Math.max(100, opts.pageLimit * 2)) : [];
    return { task, summary, pages, attempt: a };
  };
  const hasHtml = (pages: OnPagePage[]) => pages.some((p) => p.resource_type === 'html');

  // Fallback chain: follow links → crawl the sitemap's URLs (works when the homepage
  // carries nofollow) → browser user agent (works when a firewall blocks "RSiteAuditor").
  const sitemapUrl = preflight.sitemaps.find((s) => s.valid && s.isIndex)?.url ?? preflight.sitemaps.find((s) => s.valid)?.url;
  const attempts: Attempt[] = [
    { label: 'Starting crawl' },
    ...(sitemapUrl ? [{ label: 'Crawling pages from the sitemap', sitemapUrl }] : []),
    { label: 'Retrying with a browser user agent', browserUa: true, sitemapUrl },
  ];
  let crawl = await crawlOnce(attempts[0]!);
  let cost = crawl.task.cost;
  for (const attempt of attempts.slice(1)) {
    if (hasHtml(crawl.pages)) break;
    crawl = await crawlOnce(attempt);
    cost += crawl.task.cost;
  }

  const { summary, pages } = crawl;
  const notices: AudienceText[] = [];
  const reason = summary?.domain_info?.extended_crawl_status || summary?.crawl_stop_reason || 'no pages returned';
  const htmlCount = pages.filter((p) => p.resource_type === 'html').length;
  const host = new URL(finalUrl).hostname;
  if (htmlCount === 0) {
    notices.push({
      client: `We could not read the pages of ${host}, so page-by-page checks are missing from this report. Fix the issues below first, then run the audit again.`,
      expert: `Crawler returned 0 HTML pages after ${attempts.length} attempts (last status: ${reason}). Page-scope rules were skipped; site-level checks still ran.`,
    });
  } else if (crawl.attempt.sitemapUrl) {
    notices.push({
      client: 'Pages were read from the sitemap because the homepage stops search engines from following its links.',
      expert: `Link-following crawl returned nothing (${reason}); crawled sitemap URLs instead (${crawl.attempt.sitemapUrl}). Click depth and orphan checks are less reliable.`,
    });
  }
  return { summary, pages, cost, notices, detail: htmlCount ? `${htmlCount} pages crawled` : `0 pages (${reason})` };
}
