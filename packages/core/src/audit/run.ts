import type { NewAuditInput } from '../audit-input';
import { createDataForSeoClient } from '../providers/dataforseo';
import { runPreflight, type Discovery, type Preflight } from '../providers/direct-fetch';
import type { HttpLog } from '../providers/http';
import { createOpenAiClient } from '../providers/openai';
import { runPageSpeed, type PageSpeedResult } from '../providers/pagespeed';
import type { AiRecommendations, AudienceText, ReportModel } from '../types';
import { generateAiRecommendations } from './ai-recommendations';
import { buildReport } from './build-report';
import { deepCrawl, type CrawlResult } from './deep-crawl';
import { fetchPageContents, type PageContent } from './page-content';
import { probeUrlVariants, type UrlVariantProbe } from './url-probes';
import { checkLinks, type LinkCheck } from './link-check';
import { MAX_TEMPLATES, runTemplateLighthouse, type LighthouseRun } from './lighthouse';
import { buildTemplates, inlinksFromContent, type Template } from './templates';
import { collectGsc, type GscData } from './gsc-collect';
import { pagesToJudge, runAiChecks, type AiCache, type AiFindings } from './ai-checks';
import { checkMobileParity, type ParityResult } from './mobile-parity';
import { pickPages, quickCrawl } from './quick-crawl';
import type { AuditData } from './types';

/** Pipeline steps shown on the progress screen (subset of §5.3 for Modules 1–2). */
export const AUDIT_STEPS = [
  { id: 'preflight', label: 'Checking robots.txt, sitemap and domain setup' },
  { id: 'crawl', label: 'Checking pages' },
  { id: 'fetch', label: 'Collecting page data' },
  { id: 'lighthouse', label: 'Measuring speed for each page type' },
  { id: 'gsc', label: 'Reading Search Console' },
  { id: 'ai-checks', label: 'AI checks on key pages' },
  { id: 'report', label: 'Scoring and building the report' },
  { id: 'ai', label: 'Writing AI recommendations' },
] as const;

export type StepId = (typeof AUDIT_STEPS)[number]['id'];
export type StepState = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

export type AuditEnv = {
  dataforseo: { login: string; password: string; baseUrl: string };
  pagespeedKey?: string;
  /** Search Console access (agency connection); absent when not connected. */
  gsc?: { accessToken: () => Promise<string> };
  /** Admin setting lighthouse.maxTemplates: page types measured with PageSpeed (1–6). */
  maxTemplates?: number;
  /** AI-judged checks (step 7): admin limits and an optional cache. Needs `openai`. */
  aiChecks?: { maxPages: number; maxTokens: number; cache?: AiCache };
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
  finishAi?: () => Promise<{ ai: AiRecommendations | null; tokens: number }>;
  /** Tokens the AI checks used (for usage tracking). */
  aiCheckTokens?: number;
};

const WEIGHT: Record<StepId, [number, number]> = {
  preflight: [0, 10], crawl: [10, 80], fetch: [80, 82], lighthouse: [82, 92], gsc: [92, 94], 'ai-checks': [94, 96], report: [96, 100], ai: [100, 100],
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
  let probes: UrlVariantProbe[];
  let links: LinkCheck[];
  let templates: Template[];
  let lighthouse: LighthouseRun[];
  // Each page type's representative gets PageSpeed mobile + desktop (spec §7), in parallel,
  // within a budget so a quick audit stays near a minute; the homepage mobile run is reused.
  const measure = (t: Template[], quick: boolean): Promise<LighthouseRun[]> =>
    env.pagespeedKey
      ? runTemplateLighthouse(t, {
          key: env.pagespeedKey,
          homeMobile: psiP,
          homeUrl: found.homepage.finalUrl,
          log: env.log,
          budgetMs: quick ? 40_000 : 180_000,
          timeoutMs: quick ? 40_000 : 90_000,
          retries: quick ? 0 : 1,
          maxTemplates: env.maxTemplates,
        })
      : Promise.resolve([]);
  const measuring = (t: Template[]) => {
    if (env.pagespeedKey) onProgress({ step: 'lighthouse', state: 'running', detail: `${Math.min(t.length, env.maxTemplates ?? MAX_TEMPLATES)} page types`, progress: at('lighthouse', 0) });
  };

  // Search Console (optional, spec §5.5): analytics start now; URL Inspection waits for the page list.
  let inspectList: (urls: string[]) => void = () => undefined;
  const inspectUrls = new Promise<string[]>((resolve) => (inspectList = resolve));
  const gscNotices: AudienceText[] = [];
  const property = input.gscProperty;
  if (property && env.gsc) onProgress({ step: 'gsc', state: 'running', detail: property, progress: at('gsc', 0) });
  const gscP: Promise<GscData | undefined> =
    property && env.gsc
      ? env.gsc
          .accessToken()
          .then((token) => collectGsc({ token, property, rangeDays: input.gscRangeDays, inspectUrls, log: env.log }))
          .catch((err: unknown) => {
            gscNotices.push({ client: 'Search Console data could not be read, so those checks were skipped.', expert: `Search Console failed: ${err instanceof Error ? err.message : String(err)}. GSC checks skipped.` });
            return undefined;
          })
      : Promise.resolve(undefined);
  if (property && !env.gsc) {
    gscNotices.push({ client: 'Search Console was selected but is not connected, so those checks were skipped.', expert: 'GSC property selected but no Search Console connection (Settings → Search Console). GSC checks skipped.' });
  }

  // Step 7: AI checks on key pages (never on free audits) and the mobile/desktop parity check.
  const aiEnabled = Boolean(env.aiChecks && env.openai && input.source !== 'public');
  const screenshot = psiP.then((p) => (p?.screenshot ? { url: found.homepage.finalUrl, image: p.screenshot } : undefined));
  const judge = (t: Template[], c: PageContent[], quick: boolean): Promise<AiFindings | undefined> => {
    if (!aiEnabled) return Promise.resolve(undefined);
    onProgress({ step: 'ai-checks', state: 'running', progress: at('ai-checks', 0) });
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, quick ? 50_000 : 150_000));
    return runAiChecks({
      client: createOpenAiClient({ ...env.openai!, log: env.log }),
      pages: pagesToJudge(t, c, env.aiChecks!.maxPages),
      screenshot,
      maxTokens: env.aiChecks!.maxTokens,
      cache: env.aiChecks!.cache,
      deadline,
    }).catch(() => undefined);
  };
  const parityOf = (t: Template[], c: PageContent[]) => {
    const reps = new Set(t.slice(0, 4).map((x) => x.representative));
    return checkMobileParity(c.filter((x) => reps.has(x.url)), env.log).catch(() => [] as ParityResult[]);
  };
  let aiP: Promise<AiFindings | undefined> = Promise.resolve(undefined);
  let parityP: Promise<ParityResult[]> = Promise.resolve([]);

  if (mode === 'quick') {
    // Our own HTML read of the same pages runs alongside the live DataForSEO checks.
    const contentP = fetchPageContents(pickPages(found, input.pageLimit), env.log);
    const probesP = contentP.then((c) => probeUrlVariants(c, env.log));
    const linksP = contentP.then((c) => checkLinks(c, new Map(c.map((p) => [p.url, p.status])), env.log));
    const templatesP = contentP.then((c) => templatesOf(c, inlinksFromContent(c)));
    const lighthouseP = templatesP.then((t) => measure(t, true));
    aiP = Promise.all([templatesP, contentP]).then(([t, c]) => judge(t, c, true));
    parityP = Promise.all([templatesP, contentP]).then(([t, c]) => parityOf(t, c));
    const crawlP = quickCrawl(client, found, input, crawlProgress);
    preflight = await preflightP;
    onProgress({ step: 'preflight', state: 'done', progress: at('preflight', 1) });
    void templatesP.then((t) => inspectList(inspectOrder(t, [])), () => inspectList([]));
    [crawl, content, probes, links, templates] = await Promise.all([crawlP, contentP, probesP, linksP, templatesP]);
    measuring(templates);
    lighthouse = await lighthouseP;
  } else {
    preflight = await preflightP;
    onProgress({ step: 'preflight', state: 'done', progress: at('preflight', 1) });
    crawl = await deepCrawl(client, preflight, { ...input, timeoutMs: env.timeoutMs, pollMs: env.pollMs }, crawlProgress);
    const okUrls = crawl.pages.filter((p) => p.resource_type === 'html' && p.status_code === 200).map((p) => p.url);
    content = await fetchPageContents(okUrls.slice(0, input.pageLimit), env.log);
    const known = new Map(crawl.pages.map((p) => [p.url, p.status_code]));
    templates = templatesOf(content, new Map(crawl.pages.map((p) => [p.url, p.meta?.inbound_links_count ?? 0])));
    inspectList(inspectOrder(templates, okUrls));
    aiP = judge(templates, content, false);
    parityP = parityOf(templates, content);
    measuring(templates);
    [probes, links, lighthouse] = await Promise.all([probeUrlVariants(content, env.log), checkLinks(content, known, env.log), measure(templates, false)]);
  }
  const htmlCount = crawl.pages.filter((p) => p.resource_type === 'html').length;
  onProgress({ step: 'crawl', state: htmlCount ? 'done' : 'failed', detail: crawl.detail, progress: at('crawl', 1) });
  onProgress({ step: 'fetch', state: htmlCount ? 'done' : 'skipped', detail: `${crawl.pages.length} URLs`, progress: at('fetch', 1) });

  const psi = await psiP;
  const measured = lighthouse.filter((l) => l.mobile || l.desktop).length;
  onProgress(
    env.pagespeedKey
      ? {
          step: 'lighthouse',
          state: psi || measured ? 'done' : 'failed',
          detail: psi || measured ? `${measured} of ${lighthouse.length} page types measured` : 'PageSpeed did not respond',
          progress: at('lighthouse', 1),
        }
      : { step: 'lighthouse', state: 'skipped', detail: 'No PageSpeed key', progress: at('lighthouse', 1) },
  );

  const gsc = await gscP;
  if (gsc?.errors.length) {
    gscNotices.push({ client: 'Some Search Console data could not be read; those checks may be incomplete.', expert: `Search Console partial: ${gsc.errors.slice(0, 3).join(' · ')}` });
  }
  onProgress(
    gsc
      ? { step: 'gsc', state: 'done', detail: `${gsc.queries.length.toLocaleString('en-US')} queries · ${gsc.inspections.length} URLs inspected`, progress: at('gsc', 1) }
      : { step: 'gsc', state: property ? 'failed' : 'skipped', detail: property ? 'Search Console unavailable' : 'No property selected', progress: at('gsc', 1) },
  );

  const [ai, parity] = await Promise.all([aiP, parityP]);
  const aiNotices: AudienceText[] = [];
  if (aiEnabled && ai?.errors.length) {
    aiNotices.push({ client: 'Some AI checks could not run; those results are missing.', expert: `AI checks partial: ${ai.errors.slice(0, 2).join(' · ')}` });
  }
  onProgress(
    !aiEnabled
      ? { step: 'ai-checks', state: 'skipped', detail: input.source === 'public' ? 'Not on free audits' : env.openai ? 'Switched off in settings' : 'No OpenAI key', progress: at('ai-checks', 1) }
      : ai && (ai.pages.length || ai.visual)
        ? { step: 'ai-checks', state: 'done', detail: `${ai.pages.length} pages${ai.visual ? ' + mobile screenshot' : ''} · ${ai.tokens.toLocaleString('en-US')} tokens${ai.cached ? ` · ${ai.cached} cached` : ''}`, progress: at('ai-checks', 1) }
        : { step: 'ai-checks', state: 'failed', detail: 'AI checks did not answer', progress: at('ai-checks', 1) },
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
    probes,
    links,
    templates,
    lighthouse,
    psi,
    gsc,
    ai,
    parity,
    notices: [...(crawl.notices ?? []), ...gscNotices, ...aiNotices],
  };
  const report = buildReport(data, { auditId, audience: input.audience, brand: env.brand });
  onProgress({ step: 'report', state: 'done', progress: 100 });

  if (!input.aiRecommendations || !env.openai) {
    onProgress({ step: 'ai', state: 'skipped', detail: env.openai ? 'Not requested' : 'No OpenAI key', progress: 100 });
    return { report, cost: crawl.cost, aiCheckTokens: ai?.tokens };
  }
  // Optional and never fatal: the report is shown first and the plan is added when ready.
  const openai = env.openai;
  report.aiPending = true;
  const finishAi = async () => {
    onProgress({ step: 'ai', state: 'running', progress: 100 });
    try {
      const { ai, tokens } = await generateAiRecommendations(report, createOpenAiClient({ ...openai, log: env.log }));
      onProgress({ step: 'ai', state: 'done', detail: `${ai.items.length} recommendations · ${tokens.toLocaleString('en-US')} tokens`, progress: 100 });
      return { ai, tokens };
    } catch (err) {
      onProgress({ step: 'ai', state: 'failed', detail: aiErrorText(err), progress: 100 });
      return { ai: null, tokens: 0 };
    }
  };
  return { report, cost: crawl.cost, finishAi, aiCheckTokens: ai?.tokens };
}

/** Templates from indexable 200 pages (noindex pages are left out, spec §7). */
function templatesOf(content: PageContent[], inlinks: Map<string, number>): Template[] {
  const pages = content.filter((c) => c.status === 200 && !/noindex|none/.test(c.robots ?? ''));
  return buildTemplates(pages.map((c) => ({ url: c.url, content: c })), inlinks);
}

function aiErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|incorrect api key|invalid_api_key/i.test(msg)) return 'OpenAI rejected the API key';
  if (/429|quota|rate/i.test(msg)) return 'OpenAI quota or rate limit reached';
  return `OpenAI failed: ${msg.slice(0, 160)}`;
}

/** URL Inspection sample (spec §5.5): template representatives, then key pages, then the rest. */
function inspectOrder(templates: Template[], rest: string[]): string[] {
  const key = templates.filter((t) => ['home', 'service', 'location', 'service_location'].includes(t.type)).flatMap((t) => t.urls);
  return [...new Set([...templates.map((t) => t.representative), ...key, ...templates.flatMap((t) => t.urls), ...rest])];
}
