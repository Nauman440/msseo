import {
  autoShortlist, buildMapping, clusterKeywords, COMPETITOR_COUNTRIES, createCompetitorClient, createKeywordClient, createOpenAiClient, dataforseoBalance, defaultSearches,
  discoverCompetitors, emptyKeywordWorkspace, emptyWorkspace, generatePrompts, gscSearchAnalytics, normDomain, providerConfig, researchKeywords,
  type GscQuery, type KeywordWorkspace, type ReportModel,
} from '@seo/core';
import { prisma } from './client';
import { getCompetitorWorkspace, saveCompetitorWorkspace } from './competitors';
import { customerGoogleReady, customerGoogleToken, getCustomerGoogle } from './customer-google';
import { getKeywordWorkspace, saveKeywordWorkspace } from './keywords';
import { getMappingWorkspace, saveMappingWorkspace } from './mapping';
import { getSettings } from './settings';

/**
 * Autopilot for customers (2026-11-17): once after sign-up and then monthly per website, without
 * anyone clicking: find competitors → shortlist the strongest direct rivals (only if no person has)
 * → keyword research with their keyword gap and the customer's own Search Console → topics →
 * AI questions → page plan. Every run stays under an admin monthly cap (USD).
 */
export const AUTOPILOT_EVERY_DAYS = 30;
/** Rough cost of one first run, used to stop before the cap is passed. */
const RUN_ESTIMATE_USD = 0.6;
const GIANT_ETV = 1_000_000;
const LANG: Record<string, string> = { English: 'en', Urdu: 'ur', Arabic: 'ar', Spanish: 'es', French: 'fr' };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

export type AutopilotSite = { userId: string; domain: string; businessName: string; country: string | null; language: string | null; services: string[]; areas: string[]; competitors: string[] };

/** Customers' websites due a run: trial or active, onboarding finished, not run in the last 30 days. */
export async function dueAutopilotSites(now = new Date()): Promise<AutopilotSite[]> {
  const accounts = await prisma.customerAccount.findMany({
    where: { onboardingStep: { gte: 6 }, user: { active: true }, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: now } }] },
    select: { userId: true, businessName: true, website: true, extraWebsites: true, country: true, language: true, services: true, areas: true, competitors: true },
  });
  const cutoff = now.getTime() - AUTOPILOT_EVERY_DAYS * 86_400_000;
  const out: AutopilotSite[] = [];
  for (const a of accounts) {
    for (const url of [...new Set([a.website, ...a.extraWebsites].filter((w): w is string => Boolean(w)))].slice(0, 3)) {
      const domain = hostOf(url);
      if (!domain) continue;
      const kw = await getKeywordWorkspace(domain).catch(() => null);
      const last = kw?.autopilot?.lastRunAt ? Date.parse(kw.autopilot.lastRunAt) : 0;
      if (last < cutoff) out.push({ userId: a.userId, domain, businessName: a.businessName, country: a.country, language: a.language, services: a.services, areas: a.areas, competitors: a.competitors });
    }
  }
  return out;
}

/** Autopilot spend this calendar month (USD). */
export async function autopilotSpentThisMonth(now = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.apiUsage.aggregate({ where: { endpoint: 'autopilot', createdAt: { gte: from } }, _sum: { costUsd: true } });
  return Number(agg._sum.costUsd ?? 0);
}

/** One site's site-level setup: country and language from onboarding, falling back to defaults. */
function locale(site: AutopilotSite): { country?: string; language?: string } {
  const country = (COMPETITOR_COUNTRIES as readonly string[]).find((c) => c.toLowerCase() === (site.country ?? '').trim().toLowerCase());
  return { country, language: LANG[site.language ?? ''] ?? 'en' };
}

async function latestPages(domain: string): Promise<{ id: string; report: ReportModel } | null> {
  const project = await prisma.project.findUnique({ where: { domain }, select: { id: true } });
  if (!project) return null;
  const a = await prisma.audit.findFirst({ where: { projectId: project.id, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { id: true, report: true } });
  return a?.report ? { id: a.id, report: a.report as unknown as ReportModel } : null;
}

async function customerGsc(userId: string, domain: string) {
  if (!customerGoogleReady()) return [];
  const conn = await getCustomerGoogle(userId).catch(() => null);
  const property = conn?.sites[domain]?.gscProperty;
  if (!property) return [];
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const rows = await gscSearchAnalytics(await customerGoogleToken(userId), property, { startDate: day(93), endDate: day(3), dimensions: ['query', 'page'], maxRows: 5000 });
  return rows.flatMap((r) => (r.keys[0] && r.keys[1] ? [{ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }] : []));
}

export type AutopilotResult = { domain: string; steps: string[]; costUsd: number; error: string | null; skipped?: string };

/** Runs the full chain for one customer website. Never throws; each step that fails is noted. */
export async function runAutopilotSite(site: AutopilotSite, now = new Date()): Promise<AutopilotResult> {
  const domain = normDomain(site.domain);
  const { env } = providerConfig();
  if (!env) return { domain, steps: [], costUsd: 0, error: null, skipped: 'DataForSEO is not configured' };
  const before = await dataforseoBalance(env.dataforseo);
  const steps: string[] = [];
  let reported = 0;
  let tokens = 0;
  let error: string | null = null;
  const loc = locale(site);

  // 1–2. Competitors (searches from the onboarding services × areas), then the auto-shortlist.
  let competitors = (await getCompetitorWorkspace(domain).catch(() => null)) ?? emptyWorkspace(domain, { ...loc, searches: defaultSearches(site.services, site.areas) });
  if (!competitors.searches.length) competitors = { ...competitors, searches: defaultSearches(site.services, site.areas) };
  try {
    if (competitors.searches.length) {
      const r = await discoverCompetitors(createCompetitorClient(env.dataforseo), competitors);
      reported += r.cost;
      competitors = autoShortlist(r.workspace);
      await saveCompetitorWorkspace(competitors);
      steps.push(`competitors: ${competitors.competitors.length}`);
    }
  } catch (err) {
    error = `Competitors: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 3–4. Keyword research (with the shortlisted rivals' keyword gap and Search Console), then topics.
  let keywords: KeywordWorkspace = (await getKeywordWorkspace(domain).catch(() => null)) ?? emptyKeywordWorkspace(domain, { ...loc, seeds: { services: site.services, locations: site.areas } });
  if (!keywords.seeds.services.length && site.services.length) keywords = { ...keywords, seeds: { ...keywords.seeds, services: site.services.slice(0, 12), locations: keywords.seeds.locations.length ? keywords.seeds.locations : site.areas.slice(0, 10) } };
  try {
    if (keywords.seeds.services.length) {
      const rivals = competitors.competitors.filter((c) => c.shortlist === 'direct' && (c.etv ?? 0) <= GIANT_ETV).slice(0, 3);
      const gscRows = await customerGsc(site.userId, domain).catch(() => []);
      const gsc: GscQuery[] = [];
      const seen = new Map<string, GscQuery>();
      for (const r of gscRows) {
        // One entry per search: totals across pages, position and page from the page seen most.
        const prev = seen.get(r.query);
        const merged = { query: r.query, page: r.page, clicks: (prev?.clicks ?? 0) + r.clicks, impressions: (prev?.impressions ?? 0) + r.impressions, position: r.position };
        seen.set(r.query, prev && prev.impressions >= r.impressions ? { ...merged, page: prev.page, position: prev.position } : merged);
      }
      gsc.push(...seen.values());
      const kc = createKeywordClient(env.dataforseo);
      const r = await researchKeywords(kc, keywords, { competitors: rivals.map((c) => c.domain), competitorNames: [...rivals.map((c) => c.domain), ...rivals.map((c) => c.name ?? '').filter(Boolean), ...site.competitors], gsc, now });
      reported += r.cost;
      const cl = await clusterKeywords(kc, r.workspace, { now });
      reported += cl.cost;
      keywords = cl.workspace;
      steps.push(`keywords: ${keywords.keywords.filter((k) => k.status === 'kept').length}`, `topics: ${keywords.clusters.length}`);

      // 5. AI questions, refreshed monthly (only services and places are sent).
      if (env.openai && (!keywords.promptsAt || now.getTime() - Date.parse(keywords.promptsAt) > AUTOPILOT_EVERY_DAYS * 86_400_000)) {
        const p = await generatePrompts(createOpenAiClient(env.openai), keywords.seeds, domain, { businessType: keywords.businessType, country: keywords.country });
        tokens += p.tokens;
        keywords = { ...keywords, prompts: p.prompts, promptsAt: now.toISOString() };
        steps.push(`AI questions: ${p.prompts.length}`);
      }

      // 6. Page plan from the latest audit's pages (free).
      const latest = await latestPages(domain);
      if (latest?.report.pages?.length && keywords.clusters.length) {
        const plan = buildMapping({
          domain, clusters: keywords.clusters, keywords: keywords.keywords, pages: latest.report.pages, gsc: gscRows, questions: keywords.questions,
          previous: await getMappingWorkspace(domain).catch(() => null), brand: site.businessName, place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null, auditId: latest.id, now,
        });
        await saveMappingWorkspace(plan);
        steps.push(`page plan: ${plan.rows.length} topics`);
      }
    }
  } catch (err) {
    error = [error, `Keywords: ${err instanceof Error ? err.message : String(err)}`].filter(Boolean).join(' · ');
  }

  // What was really charged: the balance drop when larger than DataForSEO's per-call figures.
  const after = before === null ? null : await dataforseoBalance(env.dataforseo);
  const costUsd = Math.max(reported, before !== null && after !== null ? Math.round((before - after) * 10_000) / 10_000 : 0);
  await saveKeywordWorkspace({ ...keywords, autopilot: { lastRunAt: now.toISOString(), costUsd, steps, error } });
  await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: 'autopilot', units: 1, costUsd } }).catch(() => undefined);
  if (tokens) await prisma.apiUsage.create({ data: { provider: 'openai', endpoint: 'tokens', units: tokens } }).catch(() => undefined);
  return { domain, steps, costUsd, error };
}

/** Runs one customer's due websites now (after sign-up or a new website), under the same cap. */
export async function runAutopilotFor(userId: string, now = new Date()): Promise<{ ran: AutopilotResult[]; capped: boolean }> {
  const settings = await getSettings();
  if (!settings['autopilot.enabled']) return { ran: [], capped: false };
  let spent = await autopilotSpentThisMonth(now);
  const ran: AutopilotResult[] = [];
  for (const site of (await dueAutopilotSites(now)).filter((s) => s.userId === userId)) {
    if (spent + RUN_ESTIMATE_USD > settings['autopilot.monthlyCap']) return { ran, capped: true };
    const r = await runAutopilotSite(site, now);
    spent += r.costUsd;
    ran.push(r);
  }
  return { ran, capped: false };
}

/** Records that the team was told about the cap this month; true the first time per month. */
export async function firstCapNoticeThisMonth(now = new Date()): Promise<boolean> {
  const month = now.toISOString().slice(0, 7);
  const row = await prisma.setting.findUnique({ where: { key: 'autopilot.capNoticeMonth' } });
  if (row?.value === month) return false;
  await prisma.setting.upsert({ where: { key: 'autopilot.capNoticeMonth' }, create: { key: 'autopilot.capNoticeMonth', value: month }, update: { value: month } });
  return true;
}

/**
 * Runs every due customer website while autopilot is on and the month's spend stays under the
 * cap. Returns what ran and whether the cap stopped the rest.
 */
export async function runDueAutopilot(now = new Date(), onSite?: (r: AutopilotResult) => void): Promise<{ ran: AutopilotResult[]; capped: boolean; spent: number; cap: number }> {
  const settings = await getSettings();
  const cap = settings['autopilot.monthlyCap'];
  let spent = await autopilotSpentThisMonth(now);
  if (!settings['autopilot.enabled']) return { ran: [], capped: false, spent, cap };
  const ran: AutopilotResult[] = [];
  for (const site of await dueAutopilotSites(now)) {
    if (spent + RUN_ESTIMATE_USD > cap) return { ran, capped: true, spent, cap };
    const r = await runAutopilotSite(site, now);
    spent += r.costUsd;
    ran.push(r);
    onSite?.(r);
  }
  return { ran, capped: false, spent, cap };
}
