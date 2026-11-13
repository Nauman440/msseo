import type { NewAuditInput } from '../audit-input';
import { createDataForSeoClient, type DataForSeoClient, type OnPageSummary } from '../providers/dataforseo';
import { runPreflight } from '../providers/direct-fetch';
import type { HttpLog } from '../providers/http';
import { createOpenAiClient } from '../providers/openai';
import { runPageSpeed, type PageSpeedResult } from '../providers/pagespeed';
import { generateAiRecommendations } from './ai-recommendations';
import type { ReportModel } from '../types';
import { buildReport } from './build-report';
import type { AuditData } from './types';

/** Pipeline steps shown on the progress screen (subset of §5.3 for Modules 1–2). */
export const AUDIT_STEPS = [
  { id: 'preflight', label: 'Checking robots.txt, sitemap and domain setup' },
  { id: 'crawl', label: 'Crawling pages' },
  { id: 'fetch', label: 'Collecting page data' },
  { id: 'lighthouse', label: 'Measuring mobile speed' },
  { id: 'report', label: 'Scoring and building the report' },
  { id: 'ai', label: 'Writing AI recommendations' },
] as const;

export type StepId = (typeof AUDIT_STEPS)[number]['id'];
export type StepState = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

export type AuditEnv = {
  dataforseo: { login: string; password: string; baseUrl: string };
  pagespeedKey?: string;
  /** Enables the optional AI recommendations step. */
  openai?: { apiKey: string; model?: string };
  brand: string;
  /** Crawl polling cadence and timeout. */
  pollMs?: number;
  timeoutMs?: number;
  log?: HttpLog;
};

export type ProgressUpdate = {
  step: StepId;
  state: StepState;
  detail?: string;
  /** Overall 0–100. */
  progress: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const WEIGHT: Record<StepId, [number, number]> = {
  preflight: [0, 10], crawl: [10, 70], fetch: [70, 76], lighthouse: [76, 88], report: [88, 92], ai: [92, 100],
};
const at = (step: StepId, fraction: number) => Math.round(WEIGHT[step][0] + (WEIGHT[step][1] - WEIGHT[step][0]) * fraction);

async function waitForCrawl(
  client: DataForSeoClient,
  id: string,
  env: AuditEnv,
  onProgress: (u: ProgressUpdate) => void,
): Promise<OnPageSummary | null> {
  const deadline = Date.now() + (env.timeoutMs ?? 20 * 60_000);
  let summary: OnPageSummary | null = null;
  while (Date.now() < deadline) {
    summary = await client.summary(id);
    const crawled = summary?.crawl_status?.pages_crawled ?? 0;
    const max = summary?.crawl_status?.max_crawl_pages || 1;
    if (summary?.crawl_progress === 'finished') return summary;
    onProgress({ step: 'crawl', state: 'running', detail: `${crawled} of ${max} pages`, progress: at('crawl', Math.min(0.95, crawled / max)) });
    await sleep(env.pollMs ?? 5000);
  }
  throw new Error('The crawl took too long and was stopped. Try a smaller page limit.');
}

/** Runs a full Module 1–2 audit and returns the report. Throws with a readable message on failure. */
export async function runAudit(
  auditId: string,
  input: NewAuditInput,
  env: AuditEnv,
  onProgress: (u: ProgressUpdate) => void,
): Promise<{ report: ReportModel; cost: number }> {
  const client = createDataForSeoClient({ ...env.dataforseo, log: env.log });
  const startUrl = input.url;
  const host = new URL(startUrl).hostname;

  onProgress({ step: 'preflight', state: 'running', progress: at('preflight', 0) });
  const preflight = await runPreflight(startUrl, { log: env.log });
  if (preflight.homepage.status >= 400 || preflight.homepage.status === 0) {
    throw new Error(`The website did not respond normally (HTTP ${preflight.homepage.status || 'no response'}). Check the address.`);
  }
  onProgress({ step: 'preflight', state: 'done', progress: at('preflight', 1) });

  // PageSpeed runs in parallel with the crawl; it does not depend on it.
  const psiPromise: Promise<PageSpeedResult | null> = env.pagespeedKey
    ? runPageSpeed(preflight.homepage.finalUrl, 'mobile', env.pagespeedKey, env.log).catch(() => null)
    : Promise.resolve(null);

  type Attempt = { label: string; sitemapUrl?: string; browserUa?: boolean };
  const crawlOnce = async (a: Attempt) => {
    onProgress({ step: 'crawl', state: 'running', detail: a.label, progress: at('crawl', 0) });
    const task = await client.startCrawl({
      target: new URL(preflight.homepage.finalUrl).hostname.replace(/^www\./, ''),
      startUrl: preflight.homepage.finalUrl,
      maxCrawlPages: input.pageLimit,
      enableJavascript: input.jsRendering,
      sitemapUrl: a.sitemapUrl,
      ...(a.browserUa ? { customUserAgent: BROWSER_UA, switchPool: true } : {}),
    });
    const summary = await waitForCrawl(client, task.id, env, onProgress);
    const pages = (summary?.crawl_status?.pages_crawled ?? 0) > 0 ? await client.pages(task.id, Math.max(100, input.pageLimit * 2)) : [];
    return { task, summary, pages, attempt: a };
  };
  const hasHtml = (pages: { resource_type: string }[]) => pages.some((p) => p.resource_type === 'html');

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
  const notices: AuditData['notices'] = [];
  const reason = summary?.domain_info?.extended_crawl_status || summary?.crawl_stop_reason || 'no pages returned';
  const htmlCount = pages.filter((p) => p.resource_type === 'html').length;
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
  onProgress({ step: 'crawl', state: htmlCount ? 'done' : 'failed', detail: htmlCount ? `${htmlCount} pages crawled` : `0 pages (${reason})`, progress: at('crawl', 1) });
  onProgress({ step: 'fetch', state: htmlCount ? 'done' : 'skipped', detail: `${pages.length} URLs`, progress: at('fetch', 1) });

  if (env.pagespeedKey) {
    onProgress({ step: 'lighthouse', state: 'running', progress: at('lighthouse', 0) });
    const psi = await psiPromise;
    onProgress({ step: 'lighthouse', state: psi ? 'done' : 'failed', detail: psi ? `Score ${psi.performance ?? 'n/a'}` : 'PageSpeed did not respond', progress: at('lighthouse', 1) });
  } else {
    onProgress({ step: 'lighthouse', state: 'skipped', detail: 'No PageSpeed key', progress: at('lighthouse', 1) });
  }

  onProgress({ step: 'report', state: 'running', progress: at('report', 0) });
  const data: AuditData = {
    url: startUrl,
    pageLimit: input.pageLimit,
    jsRendering: input.jsRendering,
    crawledAt: new Date().toISOString(),
    preflight,
    summary,
    pages,
    psi: await psiPromise,
    notices,
  };
  const report = buildReport(data, { auditId, audience: input.audience, brand: env.brand });
  onProgress({ step: 'report', state: 'done', progress: at('report', 1) });

  // Optional and never fatal: the report is complete without it.
  if (input.aiRecommendations && env.openai) {
    onProgress({ step: 'ai', state: 'running', progress: at('ai', 0) });
    try {
      const client = createOpenAiClient({ ...env.openai, log: env.log });
      const { ai, tokens } = await generateAiRecommendations(report, client);
      report.ai = ai;
      onProgress({ step: 'ai', state: 'done', detail: `${ai.items.length} recommendations · ${tokens.toLocaleString('en-US')} tokens`, progress: 100 });
    } catch (err) {
      onProgress({ step: 'ai', state: 'failed', detail: aiErrorText(err), progress: 100 });
    }
  } else {
    onProgress({ step: 'ai', state: 'skipped', detail: env.openai ? 'Not requested' : 'No OpenAI key', progress: 100 });
  }
  return { report, cost };
}

function aiErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|incorrect api key|invalid_api_key/i.test(msg)) return 'OpenAI rejected the API key';
  if (/429|quota|rate/i.test(msg)) return 'OpenAI quota or rate limit reached';
  return `OpenAI failed: ${msg.slice(0, 160)}`;
}
