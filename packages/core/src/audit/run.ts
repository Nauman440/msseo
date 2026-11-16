import type { NewAuditInput } from '../audit-input';
import { createDataForSeoClient } from '../providers/dataforseo';
import { runPreflight, type Discovery, type Preflight } from '../providers/direct-fetch';
import type { HttpLog } from '../providers/http';
import { createOpenAiClient } from '../providers/openai';
import { runPageSpeed, type PageSpeedResult } from '../providers/pagespeed';
import type { AiRecommendations, ReportModel } from '../types';
import { generateAiRecommendations } from './ai-recommendations';
import { buildReport } from './build-report';
import { deepCrawl, type CrawlResult } from './deep-crawl';
import { fetchPageContents, type PageContent } from './page-content';
import { pickPages, quickCrawl } from './quick-crawl';
import type { AuditData } from './types';

/** Pipeline steps shown on the progress screen (subset of §5.3 for Modules 1–2). */
export const AUDIT_STEPS = [
  { id: 'preflight', label: 'Checking robots.txt, sitemap and domain setup' },
  { id: 'crawl', label: 'Checking pages' },
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
  /** Deep-crawl polling cadence and timeout. */
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

export type AuditOutcome = {
  report: ReportModel;
  cost: number;
  /** Set when AI recommendations were requested: runs after the report is shown. */
  finishAi?: () => Promise<AiRecommendations | null>;
};

const WEIGHT: Record<StepId, [number, number]> = {
  preflight: [0, 10], crawl: [10, 80], fetch: [80, 82], lighthouse: [82, 95], report: [95, 100], ai: [100, 100],
};
const at = (step: StepId, fraction: number) => Math.round(WEIGHT[step][0] + (WEIGHT[step][1] - WEIGHT[step][0]) * fraction);

const homepageError = (status: number) =>
  new Error(`The website did not respond normally (HTTP ${status || 'no response'}). Check the address.`);

/**
 * Runs a Module 1–2 audit and returns the report. Quick mode (default) starts checking
 * pages as soon as the homepage, robots.txt and sitemaps are read; the slower preflight
 * checks and PageSpeed run alongside. Throws with a readable message on failure.
 */
export async function runAudit(auditId: string, input: NewAuditInput, env: AuditEnv, onProgress: (u: ProgressUpdate) => void): Promise<AuditOutcome> {
  const client = createDataForSeoClient({ ...env.dataforseo, log: env.log });
  const mode = input.auditMode ?? 'quick';
  const crawlProgress = (fraction: number, detail: string) => onProgress({ step: 'crawl', state: 'running', detail, progress: at('crawl', fraction) });
  onProgress({ step: 'preflight', state: 'running', progress: at('preflight', 0) });

  let discovered: (d: Discovery) => void = () => undefined;
  const discovery = new Promise<Discovery>((resolve) => (discovered = resolve));
  const preflightP = runPreflight(input.url, { log: env.log, onDiscovery: (d) => discovered(d) });
  // Mark as handled: we may throw (bad homepage) before awaiting it; awaiting later still throws.
  preflightP.catch(() => undefined);
  // If preflight fails before discovery, the race rejects instead of waiting forever.
  const found = await Promise.race([discovery, preflightP.then(() => discovery)]);
  if (found.homepage.status >= 400 || found.homepage.status === 0) throw homepageError(found.homepage.status);

  // PageSpeed only needs the final homepage URL, so it starts now in both modes.
  const psiP: Promise<PageSpeedResult | null> = env.pagespeedKey
    ? runPageSpeed(found.homepage.finalUrl, 'mobile', env.pagespeedKey, env.log).catch(() => null)
    : Promise.resolve(null);

  let preflight: Preflight;
  let crawl: CrawlResult;
  let content: PageContent[];
  if (mode === 'quick') {
    // Our own HTML read of the same pages runs alongside the live DataForSEO checks.
    const contentP = fetchPageContents(pickPages(found, input.pageLimit), env.log);
    const crawlP = quickCrawl(client, found, input, crawlProgress);
    preflight = await preflightP;
    onProgress({ step: 'preflight', state: 'done', progress: at('preflight', 1) });
    [crawl, content] = await Promise.all([crawlP, contentP]);
  } else {
    preflight = await preflightP;
    onProgress({ step: 'preflight', state: 'done', progress: at('preflight', 1) });
    crawl = await deepCrawl(client, preflight, { ...input, timeoutMs: env.timeoutMs, pollMs: env.pollMs }, crawlProgress);
    const okUrls = crawl.pages.filter((p) => p.resource_type === 'html' && p.status_code === 200).map((p) => p.url);
    content = await fetchPageContents(okUrls.slice(0, input.pageLimit), env.log);
  }
  const htmlCount = crawl.pages.filter((p) => p.resource_type === 'html').length;
  onProgress({ step: 'crawl', state: htmlCount ? 'done' : 'failed', detail: crawl.detail, progress: at('crawl', 1) });
  onProgress({ step: 'fetch', state: htmlCount ? 'done' : 'skipped', detail: `${crawl.pages.length} URLs`, progress: at('fetch', 1) });

  if (env.pagespeedKey) onProgress({ step: 'lighthouse', state: 'running', progress: at('lighthouse', 0) });
  const psi = await psiP;
  onProgress(
    env.pagespeedKey
      ? { step: 'lighthouse', state: psi ? 'done' : 'failed', detail: psi ? `Score ${psi.performance ?? 'n/a'}` : 'PageSpeed did not respond', progress: at('lighthouse', 1) }
      : { step: 'lighthouse', state: 'skipped', detail: 'No PageSpeed key', progress: at('lighthouse', 1) },
  );

  onProgress({ step: 'report', state: 'running', progress: at('report', 0) });
  const data: AuditData = {
    url: input.url,
    pageLimit: input.pageLimit,
    jsRendering: input.jsRendering,
    mode,
    crawledAt: new Date().toISOString(),
    preflight,
    summary: crawl.summary,
    pages: crawl.pages,
    content,
    psi,
    notices: crawl.notices,
  };
  const report = buildReport(data, { auditId, audience: input.audience, brand: env.brand });
  onProgress({ step: 'report', state: 'done', progress: 100 });

  if (!input.aiRecommendations || !env.openai) {
    onProgress({ step: 'ai', state: 'skipped', detail: env.openai ? 'Not requested' : 'No OpenAI key', progress: 100 });
    return { report, cost: crawl.cost };
  }
  // Optional and never fatal: the report is shown first and the plan is added when ready.
  const openai = env.openai;
  report.aiPending = true;
  const finishAi = async () => {
    onProgress({ step: 'ai', state: 'running', progress: 100 });
    try {
      const { ai, tokens } = await generateAiRecommendations(report, createOpenAiClient({ ...openai, log: env.log }));
      onProgress({ step: 'ai', state: 'done', detail: `${ai.items.length} recommendations · ${tokens.toLocaleString('en-US')} tokens`, progress: 100 });
      return ai;
    } catch (err) {
      onProgress({ step: 'ai', state: 'failed', detail: aiErrorText(err), progress: 100 });
      return null;
    }
  };
  return { report, cost: crawl.cost, finishAi };
}

function aiErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|incorrect api key|invalid_api_key/i.test(msg)) return 'OpenAI rejected the API key';
  if (/429|quota|rate/i.test(msg)) return 'OpenAI quota or rate limit reached';
  return `OpenAI failed: ${msg.slice(0, 160)}`;
}
