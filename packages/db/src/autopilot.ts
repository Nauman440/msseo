import { randomUUID } from 'node:crypto';
import {
  AI_PLAN_EVERY_DAYS, autoPlan, autoShortlist, capacityFor, planExtrasFrom, writeAiPlan, type AeoWorkspace, type BacklinkWorkspace, type ContentAudit, type LocalAudit, emptyActions, emptyMapping, seedsFromPages, buildMapping, clusterKeywords, COMPETITOR_COUNTRIES, createCompetitorClient, createKeywordClient, createOpenAiClient, dataforseoBalance, defaultSearches,
  discoverCompetitors, emptyKeywordWorkspace, emptyWorkspace, generatePrompts, gscSearchAnalytics, mergePrompts, normDomain, providerConfig, researchKeywords,
  type GscQuery, type KeywordWorkspace, type ReportModel,
} from '@seo/core';
import { getActionWorkspace, saveActionWorkspace } from './actions';
import { prisma } from './client';
import { getCompetitorWorkspace, saveCompetitorWorkspace } from './competitors';
import { searchConsoleFor } from './google-access';
import { getKeywordWorkspace, saveKeywordWorkspace } from './keywords';
import { getMappingWorkspace, saveMappingWorkspace } from './mapping';
import { getSettings } from './settings';
import { getSiteDocument } from './site-documents';

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

/**
 * `primary`: the website from sign-up, whose onboarding answers (services, areas) are its research inputs.
 * `rederive`: read this (non-primary) website's services and places from its pages again, replacing inputs
 * that were copied from the first website.
 */
/** `team`: one of the team's client sites (no customer account; userId is empty). */
export type AutopilotSite = { userId: string; domain: string; primary: boolean; team?: boolean; rederive?: boolean; /** Customer plan (team sites: growth); sets the AI plan's monthly capacity. */ tier?: 'autopilot' | 'growth'; businessName: string; country: string | null; language: string | null; services: string[]; areas: string[]; competitors: string[] };

type AccountRow = { userId: string; plan?: string; businessName: string; website: string | null; country: string | null; language: string | null; services: string[]; areas: string[]; competitors: string[] };

/**
 * One website of an account. The sign-up answers (business name, services, areas, competitors) belong
 * to the sign-up website only; any other website gets its own (read from its pages by the run).
 */
function siteOf(a: AccountRow, domain: string): AutopilotSite {
  const primary = Boolean(a.website && hostOf(a.website) === domain);
  const fromAddress = domain.split('.')[0]!.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    userId: a.userId, domain, primary, country: a.country, language: a.language, tier: a.plan === 'autopilot' ? 'autopilot' : 'growth',
    businessName: primary ? a.businessName || fromAddress : fromAddress,
    services: primary ? a.services : [], areas: primary ? a.areas : [], competitors: primary ? a.competitors : [],
  };
}

/**
 * A website whose competitors and keywords were built from another website's sign-up answers: start it
 * again from its own pages. Keeps what a person added by hand (keywords typed in or imported, questions
 * written or edited, competitors added by hand) and the audit's own findings in the action plan.
 */
export async function resetBorrowedData(domain: string, site: Pick<AutopilotSite, 'country' | 'language'>): Promise<void> {
  const loc = locale({ country: site.country, language: site.language } as AutopilotSite);
  const kw = await getKeywordWorkspace(domain).catch(() => null);
  const fresh = emptyKeywordWorkspace(domain, loc);
  await saveKeywordWorkspace({
    ...fresh,
    keywords: (kw?.keywords ?? []).filter((k) => k.sources.some((x) => x === 'manual' || x === 'import')).map((k) => ({ ...k, clusterId: null })),
    prompts: (kw?.prompts ?? []).filter((p) => p.custom),
  });
  const comp = await getCompetitorWorkspace(domain).catch(() => null);
  await saveCompetitorWorkspace({ ...emptyWorkspace(domain, loc), competitors: (comp?.competitors ?? []).filter((c) => c.sources.includes('manual')) });
  await saveMappingWorkspace(emptyMapping(domain));
  const actions = await getActionWorkspace(domain).catch(() => null);
  if (actions) await saveActionWorkspace({ ...actions, aiPlan: null, actions: actions.actions.filter((a) => a.source.kind === 'audit' || a.status === 'done' || a.status === 'verified') });
  await prisma.competitorAnalysis.deleteMany({ where: { domain } }).catch(() => undefined);
  await prisma.siteDocument.deleteMany({ where: { domain, kind: { in: ['local', 'aeo'] } } }).catch(() => undefined);
}

/** Team client sites: audited by the team in the last 120 days, and not a customer's website. */
export const TEAM_SITE_DAYS = 120;

async function dueTeamSites(now: Date, customerDomains: Set<string>, cutoff: number): Promise<AutopilotSite[]> {
  const projects = await prisma.project.findMany({
    where: { audits: { some: { source: 'team', status: 'completed', createdAt: { gte: new Date(now.getTime() - TEAM_SITE_DAYS * 86_400_000) } } } },
    select: { domain: true, businessName: true, services: true, serviceArea: true },
  });
  const out: AutopilotSite[] = [];
  for (const p of projects) {
    const domain = normDomain(p.domain);
    if (!domain || customerDomains.has(domain)) continue;
    const kw = await getKeywordWorkspace(domain).catch(() => null);
    const last = kw?.autopilot?.lastRunAt ? Date.parse(kw.autopilot.lastRunAt) : 0;
    if (last >= cutoff) continue;
    const areas = Array.isArray(p.serviceArea) ? p.serviceArea.filter((x): x is string => typeof x === 'string') : [];
    const fromAddress = domain.split('.')[0]!.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    // Services set on the project count as its research inputs; otherwise the run reads them from the site's pages.
    out.push({ userId: '', domain, team: true, primary: p.services.length > 0, businessName: p.businessName || fromAddress, country: kw?.country ?? null, language: null, services: p.services, areas, competitors: [] });
  }
  return out;
}

/**
 * Websites due a run (not run in the last 30 days): customers' first (trial or active, onboarding
 * finished), then, when `includeTeam`, the team's client sites.
 */
export async function dueAutopilotSites(now = new Date(), includeTeam = false): Promise<AutopilotSite[]> {
  const accounts = await prisma.customerAccount.findMany({
    where: { onboardingStep: { gte: 6 }, user: { active: true }, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: now } }] },
    select: { userId: true, plan: true, businessName: true, website: true, extraWebsites: true, country: true, language: true, services: true, areas: true, competitors: true },
  });
  const cutoff = now.getTime() - AUTOPILOT_EVERY_DAYS * 86_400_000;
  const out: AutopilotSite[] = [];
  for (const a of accounts) {
    for (const url of [...new Set([a.website, ...a.extraWebsites].filter((w): w is string => Boolean(w)))].slice(0, 3)) {
      const domain = hostOf(url);
      if (!domain) continue;
      const kw = await getKeywordWorkspace(domain).catch(() => null);
      const last = kw?.autopilot?.lastRunAt ? Date.parse(kw.autopilot.lastRunAt) : 0;
      if (last < cutoff) out.push(siteOf(a, domain));
    }
  }
  if (includeTeam) {
    const customerDomains = new Set(accounts.flatMap((a) => [a.website, ...a.extraWebsites]).filter((w): w is string => Boolean(w)).map(hostOf));
    out.push(...(await dueTeamSites(now, customerDomains, cutoff).catch(() => [])));
  }
  return out;
}

/** Autopilot spend this calendar month (USD). */
export async function autopilotSpentThisMonth(now = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Autopilot runs and the analyses customers start themselves share the same monthly cap.
  const agg = await prisma.apiUsage.aggregate({ where: { endpoint: { in: ['autopilot', 'competitor-analysis', 'backlinks', 'local', 'aeo', 'monitoring'] }, createdAt: { gte: from } }, _sum: { costUsd: true } });
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

/** Search Console rows (search × page, 90 days): the customer's own connection first, else the team's agency one. */
async function siteGsc(domain: string) {
  const access = await searchConsoleFor(domain).catch(() => null);
  if (!access) return [];
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const rows = await gscSearchAnalytics(access.token, access.property, { startDate: day(93), endDate: day(3), dimensions: ['query', 'page'], maxRows: 5000 });
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

  // Research inputs: the website's own (Keywords → Research inputs) first; the sign-up website falls back
  // to its onboarding answers; any other website reads its services and places from its own pages, so a
  // second website never starts with the first one's keywords.
  const saved = await getKeywordWorkspace(domain).catch(() => null);
  let seeds = { services: site.services, areas: site.areas };
  let businessType: 'services' | 'shop' | undefined;
  if (saved?.seeds.services.length && !site.rederive) seeds = { services: saved.seeds.services, areas: saved.seeds.locations };
  else if (!site.primary) {
    const latest = await latestPages(domain);
    if (!latest?.report.pages?.length) return { domain, steps: [], costUsd: 0, error: null, skipped: 'Waiting for the first audit of this website' };
    const derived = await seedsFromPages(latest.report.pages, env.openai ? createOpenAiClient(env.openai) : null, site.businessName);
    tokens += derived.tokens;
    seeds = { services: derived.services, areas: derived.locations };
    businessType = derived.businessType;
    steps.push(`research inputs from the site: ${derived.services.length} services`);
  }

  // 1–2. Competitors (searches from the services × areas), then the auto-shortlist.
  let competitors = (await getCompetitorWorkspace(domain).catch(() => null)) ?? emptyWorkspace(domain, { ...loc, searches: defaultSearches(seeds.services, seeds.areas) });
  if (site.rederive && seeds.services.length) competitors = { ...competitors, searches: defaultSearches(seeds.services, seeds.areas) };
  if (!competitors.searches.length) competitors = { ...competitors, searches: defaultSearches(seeds.services, seeds.areas) };
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
  let keywords: KeywordWorkspace = saved
    ? site.rederive && seeds.services.length
      ? { ...saved, businessType: businessType ?? saved.businessType, seeds: { ...saved.seeds, services: seeds.services, locations: seeds.areas } }
      : saved
    : emptyKeywordWorkspace(domain, { ...loc, businessType, seeds: { services: seeds.services, locations: seeds.areas } });
  if (!keywords.seeds.services.length && seeds.services.length) keywords = { ...keywords, seeds: { ...keywords.seeds, services: seeds.services.slice(0, 12), locations: keywords.seeds.locations.length ? keywords.seeds.locations : seeds.areas.slice(0, 10) } };
  try {
    if (keywords.seeds.services.length) {
      const rivals = competitors.competitors.filter((c) => c.shortlist === 'direct' && (c.etv ?? 0) <= GIANT_ETV).slice(0, 3);
      const gscRows = await siteGsc(domain).catch(() => []);
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
      const audited = await latestPages(domain);
      const pageTitles = (audited?.report.pages ?? []).flatMap((p) => [p.title ?? '', p.h1 ?? '']).filter(Boolean);
      const r = await researchKeywords(kc, keywords, { competitors: rivals.map((c) => c.domain), competitorNames: [...rivals.map((c) => c.domain), ...rivals.map((c) => c.name ?? '').filter(Boolean), ...site.competitors], gsc, now, pageTitles });
      reported += r.cost;
      const cl = await clusterKeywords(kc, r.workspace, { now });
      reported += cl.cost;
      keywords = cl.workspace;
      steps.push(`keywords: ${keywords.keywords.filter((k) => k.status === 'kept').length}`, `topics: ${keywords.clusters.length}`);

      // 5. AI questions, refreshed monthly (only services and places are sent).
      if (env.openai && (!keywords.promptsAt || now.getTime() - Date.parse(keywords.promptsAt) > AUTOPILOT_EVERY_DAYS * 86_400_000)) {
        const p = await generatePrompts(createOpenAiClient(env.openai), keywords.seeds, domain, { businessType: keywords.businessType, country: keywords.country });
        tokens += p.tokens;
        keywords = { ...keywords, prompts: mergePrompts(keywords.prompts, p.prompts), promptsAt: now.toISOString() };
        steps.push(`AI questions: ${p.prompts.length}`);
      }

      // 6. Page plan from the latest audit's pages (free).
      const latest = await latestPages(domain);
      if (latest?.report.pages?.length && keywords.clusters.length) {
        const plan = buildMapping({
          domain, clusters: keywords.clusters, keywords: keywords.keywords, pages: latest.report.pages, sitemapUrls: latest.report.sitemap?.corrected?.urls, gsc: gscRows, questions: keywords.questions,
          previous: await getMappingWorkspace(domain).catch(() => null), brand: site.businessName, place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null, places: keywords.businessType === 'shop' ? [] : keywords.seeds.locations, auditId: latest.id, now,
        });
        await saveMappingWorkspace(plan);
        steps.push(`page plan: ${plan.rows.length} topics`);
        // 7. The six-month action plan: written by AI (monthly) when OpenAI is set up, else every finding
        // and page-plan topic not in it yet by the fixed rules (free).
        const actions = (await getActionWorkspace(domain).catch(() => null)) ?? emptyActions(domain);
        const aiDue = !actions.aiPlan || now.getTime() - Date.parse(actions.aiPlan.generatedAt) > AI_PLAN_EVERY_DAYS * 86_400_000;
        if (env.openai && aiDue) {
          try {
            const tier = site.tier ?? 'growth';
            const [backlinks, local, aeo, content] = await Promise.all([
              getSiteDocument<BacklinkWorkspace>('backlinks', domain).catch(() => null),
              getSiteDocument<LocalAudit>('local', domain).catch(() => null),
              getSiteDocument<AeoWorkspace>('aeo', domain).catch(() => null),
              getSiteDocument<ContentAudit>('content', domain).catch(() => null),
            ]);
            const written = await writeAiPlan(
              createOpenAiClient(env.openai),
              actions,
              {
                domain, tier, capacity: capacityFor(await getSettings(), tier), keywords, mapping: plan, report: latest.report, country: keywords.country,
                priorities: site.primary ? site.services.slice(0, 5) : [], start: now, extras: planExtrasFrom({ gsc: gscRows.length ? gscRows : null, backlinks, local, aeo, content }),
              },
              { newId: randomUUID, now, report: latest.report, gsc: null },
            );
            tokens += written.tokens;
            await saveActionWorkspace(written.workspace);
            steps.push(`AI action plan: ${written.workspace.actions.filter((x) => x.source.kind === 'ai' && x.source.planId === written.workspace.aiPlan?.id).length} tasks`);
          } catch (err) {
            error = [error, `AI action plan: ${err instanceof Error ? err.message : String(err)}`].filter(Boolean).join(' · ');
          }
        } else if (!env.openai) {
          const next = autoPlan(actions, latest.report, plan, { gsc: null, newId: randomUUID, now });
          if (next) {
            await saveActionWorkspace(next);
            steps.push(`action plan: ${next.actions.length - actions.actions.length} added`);
          }
        }
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
  for (const site of await dueAutopilotSites(now, settings['autopilot.teamSites'])) {
    if (spent + RUN_ESTIMATE_USD > cap) return { ran, capped: true, spent, cap };
    const r = await runAutopilotSite(site, now);
    spent += r.costUsd;
    ran.push(r);
    onSite?.(r);
  }
  return { ran, capped: false, spent, cap };
}

/**
 * Runs one customer website now, whatever its last run (a page opened with no keywords yet, or a
 * second website whose inputs were copied from the first). Same on/off switch and monthly cap.
 */
export async function runAutopilotNow(userId: string, domain: string, opts: { rederive?: boolean } = {}, now = new Date()): Promise<AutopilotResult | null> {
  const settings = await getSettings();
  const a = await prisma.customerAccount.findUnique({
    where: { userId },
    select: { userId: true, plan: true, businessName: true, website: true, extraWebsites: true, country: true, language: true, services: true, areas: true, competitors: true },
  });
  if (!a || ![a.website, ...a.extraWebsites].some((w) => w && hostOf(w) === domain)) return null;
  const primary = Boolean(a.website && hostOf(a.website) === domain);
  const site = { ...siteOf(a, domain), rederive: Boolean(opts.rederive) && !primary };
  if (site.rederive) await resetBorrowedData(domain, site);
  if (!settings['autopilot.enabled'] || (await autopilotSpentThisMonth(now)) + RUN_ESTIMATE_USD > settings['autopilot.monthlyCap']) return null;
  return runAutopilotSite(site, now);
}
