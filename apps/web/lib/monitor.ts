import 'server-only';
import {
  buildDailyDeps, buildWeeklyDeps, dailyChecks, emptyMonitor, monthlyReport, nextMeeting, normDomain, pickTrackedKeywords, weeklyRun, type MeetingCadence, type MonitorWorkspace, type MonthlyReport,
} from '@seo/core';
import { accountSites, domainOf, listAccounts } from './accounts';
import { getActions } from './actions';
import { getAeo } from './aeo';
import { getWorkspace } from './competitors';
import { customerAudits } from './customer-data';
import { ga4Access, getKeywordWorkspace, gscAccess } from './keywords';
import { getLocal } from './local';
import { getMapping } from './mapping';
import { providerConfig } from './providers-config';
import { getDoc, recordRun, saveDoc } from './site-docs';

/**
 * Module 13 · monitoring (`SiteDocument` kind "monitor"). The worker runs the daily, weekly and monthly
 * jobs; this file serves the pages and the team's "Run checks now" (same core logic).
 */
const KIND = 'monitor';

export async function isCustomerSite(domain: string): Promise<boolean> {
  return (await listAccounts()).some((a) => a.status !== 'cancelled' && accountSites(a).some((w) => domainOf(w) === domain));
}

export async function getMonitor(rawDomain: string): Promise<MonitorWorkspace> {
  const domain = normDomain(rawDomain);
  const ws = (await getDoc<MonitorWorkspace>(KIND, domain)) ?? emptyMonitor(domain);
  if (!ws.enabled && (await isCustomerSite(domain))) ws.enabled = true;
  if (!ws.ranks.custom && !ws.ranks.keywords.length) ws.ranks.keywords = pickTrackedKeywords(await getKeywordWorkspace(domain));
  return ws;
}
export const saveMonitor = (ws: MonitorWorkspace) => saveDoc(KIND, ws.domain, ws);

async function context(domain: string) {
  const [gsc, ga4, audits, mapping, comp, local, aeo] = await Promise.all([
    gscAccess(domain), ga4Access(domain), customerAudits(`https://${domain}/`), getMapping(domain), getWorkspace(domain), getLocal(domain), getAeo(domain),
  ]);
  const report = audits.latest ?? null;
  const mapped = mapping.rows.filter((r) => r.url).sort((a, b) => b.priority - a.priority).map((r) => r.url!);
  const typed = (report?.pages ?? []).filter((p) => /^(service|location|service_location|contact)$/.test(p.pageType ?? '')).map((p) => p.url);
  return {
    gsc,
    ga4,
    report,
    keyPages: [...new Set([...mapped.slice(0, 5), ...typed.slice(0, 4)])].filter((u) => domainOf(u) === domain).slice(0, 7),
    locale: { country: comp.country, language: comp.language },
    cid: local?.profile?.cid ?? null,
    aiShare: aeo.audit?.share.all.find((s) => s.you)?.share ?? null,
  };
}

/** Team: the daily checks and a weekly snapshot now (rank tracking ≈ $0.002 per keyword). */
export async function runMonitorNow(rawDomain: string): Promise<{ ws: MonitorWorkspace; alerts: number; cost: number }> {
  const domain = normDomain(rawDomain);
  const [ws, ctx] = await Promise.all([getMonitor(domain), context(domain)]);
  ws.enabled = true;
  const { env } = providerConfig();
  let calls = 0;
  const log = (e: { provider: string }) => void (e.provider === 'dataforseo' && calls++);
  const d = await dailyChecks(ws, buildDailyDeps({ domain, keyPages: ctx.keyPages, gsc: ctx.gsc }));
  const w = await weeklyRun(d.ws, buildWeeklyDeps({ domain, gsc: ctx.gsc, ga4: ctx.ga4, dfs: env ? { ...env.dataforseo, log } : null, locale: ctx.locale, cid: ctx.cid, score: ctx.report?.overall.score ?? null, aiShare: ctx.aiShare }));
  await saveMonitor(w.ws);
  if (w.cost > 0) await recordRun('monitoring', (await isCustomerSite(domain)) ? 'customer' : 'team', calls, w.cost);
  return { ws: w.ws, alerts: d.raised.length + w.raised.length, cost: w.cost };
}

export async function updateMonitor(rawDomain: string, change: (ws: MonitorWorkspace) => void): Promise<MonitorWorkspace> {
  const ws = await getMonitor(rawDomain);
  change(ws);
  await saveMonitor(ws);
  return ws;
}

export function setMeeting(ws: MonitorWorkspace, cadence: MeetingCadence, next: string | null, notes: string) {
  ws.meeting = { cadence, next: next || (cadence === 'none' ? null : nextMeeting(cadence, new Date())), notes: notes.slice(0, 2000) };
}

/** 13.3 The month's report: snapshots, rankings, alerts and finished fixes. */
export async function getMonthlyReport(rawDomain: string, month: string): Promise<MonthlyReport> {
  const [ws, actions] = await Promise.all([getMonitor(rawDomain), getActions(rawDomain)]);
  return monthlyReport(ws, month, {
    done: actions.actions.filter((a) => a.doneAt && (a.status === 'done' || a.status === 'verified')).map((a) => ({ title: a.title, doneAt: a.doneAt! })),
    open: actions.actions.filter((a) => a.status === 'todo' || a.status === 'in_progress').length,
  });
}
