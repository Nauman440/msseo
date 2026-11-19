import {
  buildDailyDeps, buildWeeklyDeps, dailyChecks, emptyMonitor, monthlyReport, pickTrackedKeywords, providerConfig, weeklyRun, weeklySummary, WEEKLY_MONITOR_ESTIMATE_USD,
  type AeoWorkspace, type LocalAudit, type MonitorAlert, type MonitorWorkspace, type MonthlyReport,
} from '@seo/core';
import { getActionWorkspace } from './actions';
import { autopilotSpentThisMonth } from './autopilot';
import { prisma } from './client';
import { getCompetitorWorkspace } from './competitors';
import { certificateExpiry } from '@seo/core/server';
import { analyticsFor, hostOf, lastTwoAudits, latestAudit, searchConsoleFor } from './google-access';
import { getKeywordWorkspace } from './keywords';
import { getMappingWorkspace } from './mapping';
import { getSettings } from './settings';
import { getSiteDocument, saveSiteDocument } from './site-documents';

/**
 * Module 13 in the worker: daily alerts (06:15 UTC), weekly snapshot + rank tracking (Mondays
 * 10:00 UTC) and the monthly report (1st, 11:00 UTC) for every customer website (trial or active,
 * onboarding finished) and every team site where monitoring was switched on.
 */
const KIND = 'monitor';

export async function getMonitor(domain: string): Promise<MonitorWorkspace> {
  return (await getSiteDocument<MonitorWorkspace>(KIND, domain)) ?? emptyMonitor(domain);
}
export const saveMonitor = (ws: MonitorWorkspace) => saveSiteDocument(KIND, ws.domain, ws);

export async function monitorTargets(now = new Date()): Promise<{ domain: string; customer: boolean }[]> {
  const accounts = await prisma.customerAccount.findMany({
    where: { onboardedAt: { not: null }, user: { active: true }, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: now } }] },
    select: { website: true, extraWebsites: true },
  });
  const customer = new Set(accounts.flatMap((a) => [a.website, ...a.extraWebsites].filter((w): w is string => Boolean(w)).slice(0, 3).map(hostOf)).filter(Boolean));
  const docs = await prisma.siteDocument.findMany({ where: { kind: KIND }, select: { domain: true, data: true } });
  const team = docs.filter((d) => (d.data as unknown as MonitorWorkspace).enabled && !customer.has(d.domain)).map((d) => d.domain);
  return [...[...customer].map((domain) => ({ domain, customer: true })), ...team.map((domain) => ({ domain, customer: false }))];
}

/** Everything the checks need about a site: Google access, key pages, locale, Business Profile, scores. */
export async function monitorContext(domain: string) {
  const [gsc, ga4, latest, mapping, kw, comp, local, aeo, gbp] = await Promise.all([
    searchConsoleFor(domain).catch(() => null),
    analyticsFor(domain).catch(() => null),
    latestAudit(domain).catch(() => ({ report: null, finishedAt: null })),
    getMappingWorkspace(domain).catch(() => null),
    getKeywordWorkspace(domain).catch(() => null),
    getCompetitorWorkspace(domain).catch(() => null),
    getSiteDocument<LocalAudit>('local', domain).catch(() => null),
    getSiteDocument<AeoWorkspace>('aeo', domain).catch(() => null),
    getSiteDocument<{ ref?: string | null }>('gbp', domain).catch(() => null),
  ]);
  const mapped = (mapping?.rows ?? []).filter((r) => r.url).sort((a, b) => b.priority - a.priority).map((r) => r.url!);
  const typed = (latest.report?.pages ?? []).filter((p) => /^(service|location|service_location|contact)$/.test(p.pageType ?? '')).map((p) => p.url);
  return {
    gsc,
    ga4,
    report: latest.report,
    kw,
    keyPages: [...new Set([...mapped.slice(0, 5), ...typed.slice(0, 4)])].filter((u) => hostOf(u) === domain).slice(0, 7),
    locale: { country: comp?.country ?? kw?.country ?? 'United States', language: comp?.language ?? kw?.language ?? 'en' },
    // The profile entered by hand ("cid:…" / "place_id:…") when the local audit has not found one.
    cid: local?.profile?.cid ?? gbp?.ref ?? null,
    aiShare: aeo?.audit?.share.all.find((s) => s.you)?.share ?? null,
  };
}

/** The tracked keywords default to the site's top topics (13.5) until someone picks them by hand. */
function prepare(ws: MonitorWorkspace, ctx: Awaited<ReturnType<typeof monitorContext>>, customer: boolean) {
  if (customer) ws.enabled = true;
  if (!ws.ranks.custom && ctx.kw) ws.ranks.keywords = pickTrackedKeywords(ctx.kw);
}

export type MonitorRun = { domain: string; customer: boolean; raised: MonitorAlert[]; error?: string };

export async function runMonitorDaily(now = new Date()): Promise<MonitorRun[]> {
  const out: MonitorRun[] = [];
  for (const t of await monitorTargets(now)) {
    try {
      const [ws, ctx] = await Promise.all([getMonitor(t.domain), monitorContext(t.domain)]);
      prepare(ws, ctx, t.customer);
      const r = await dailyChecks(ws, buildDailyDeps({ domain: t.domain, keyPages: ctx.keyPages, gsc: ctx.gsc, certExpiry: () => certificateExpiry(t.domain), audits: () => lastTwoAudits(t.domain) }), now);
      await saveMonitor(r.ws);
      out.push({ domain: t.domain, customer: t.customer, raised: r.raised });
    } catch (err) {
      out.push({ domain: t.domain, customer: t.customer, raised: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

export type WeeklyMonitorRun = MonitorRun & { summary: { headline: string; lines: string[] } | null; cost: number; paidChecks: boolean };

/** Weekly snapshot. Customer sites only pay for rank and review checks while under the autopilot cap. */
export async function runMonitorWeekly(now = new Date()): Promise<WeeklyMonitorRun[]> {
  const { env } = providerConfig();
  const settings = await getSettings();
  const out: WeeklyMonitorRun[] = [];
  for (const t of await monitorTargets(now)) {
    try {
      const [ws, ctx] = await Promise.all([getMonitor(t.domain), monitorContext(t.domain)]);
      if (ws.state.lastWeekly && now.getTime() - Date.parse(ws.state.lastWeekly) < 6 * 86_400_000) continue;
      prepare(ws, ctx, t.customer);
      const paid = Boolean(env) && (!t.customer || (settings['autopilot.enabled'] && (await autopilotSpentThisMonth(now)) + WEEKLY_MONITOR_ESTIMATE_USD <= settings['autopilot.monthlyCap']));
      const r = await weeklyRun(ws, buildWeeklyDeps({ domain: t.domain, gsc: ctx.gsc, ga4: ctx.ga4, dfs: paid && env ? env.dataforseo : null, locale: ctx.locale, cid: ctx.cid, score: ctx.report?.overall.score ?? null, aiShare: ctx.aiShare }), now);
      await saveMonitor(r.ws);
      if (r.cost > 0) await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: t.customer ? 'monitoring' : 'monitoring-team', units: r.ws.ranks.keywords.length, costUsd: r.cost } }).catch(() => undefined);
      out.push({ domain: t.domain, customer: t.customer, raised: r.raised, summary: weeklySummary(r.ws), cost: r.cost, paidChecks: paid });
    } catch (err) {
      out.push({ domain: t.domain, customer: t.customer, raised: [], summary: null, cost: 0, paidChecks: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/** 13.3 Last month's report for every monitored site (the worker emails a link to it). */
export async function monthlyReports(now = new Date()): Promise<{ domain: string; customer: boolean; report: MonthlyReport }[]> {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = d.toISOString().slice(0, 7);
  const out: { domain: string; customer: boolean; report: MonthlyReport }[] = [];
  for (const t of await monitorTargets(now)) {
    const ws = await getMonitor(t.domain);
    if (ws.state.lastMonthly?.startsWith(month) || !ws.snapshots.some((s) => s.date.startsWith(month))) continue;
    const actions = await getActionWorkspace(t.domain).catch(() => null);
    const list = actions?.actions ?? [];
    const report = monthlyReport(ws, month, {
      done: list.filter((a) => a.doneAt && (a.status === 'done' || a.status === 'verified')).map((a) => ({ title: a.title, doneAt: a.doneAt! })),
      open: list.filter((a) => a.status === 'todo' || a.status === 'in_progress').length,
    });
    ws.state.lastMonthly = `${month}-sent`;
    await saveMonitor(ws);
    out.push({ domain: t.domain, customer: t.customer, report });
  }
  return out;
}
