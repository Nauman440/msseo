import 'server-only';
import { randomUUID } from 'node:crypto';
import { autoPlan, WEEKLY_MONITOR_ESTIMATE_USD, type ActionWorkspace } from '@seo/core';
import { domainOf, type Account } from './accounts';
import { getActions, planContext, saveActions } from './actions';
import { getAeo, runAeo } from './aeo';
import { getAltText, runAltText } from './alt-text';
import { getAnalysis, runAnalysis } from './analysis';
import { usingDatabase } from './audit-store';
import { isOlderThan, prepare } from './auto';
import { getBacklinks, runBacklinks } from './backlinks';
import { getSavedWorkspace } from './competitors';
import { getContent, runContent } from './content';
import { getKeywordWorkspace } from './keywords';
import { getLocal, runLocal } from './local';
import { getMonitor, runMonitorNow } from './monitor';
import { underCap } from './site-docs';
import { getTracking, runTracking } from './tracking';

/**
 * What each customer page prepares by itself on first visit (see lib/auto.ts). Free sections are
 * refreshed when older than 30 days; paid ones run once (then monthly or weekly by their own jobs)
 * and keep the customer limits and the autopilot cap. Each returns true while something is preparing.
 */
const FREE_REFRESH_DAYS = 30;
const DAY = 86_400_000;

export async function autoContent(domain: string, hasAudit: boolean): Promise<boolean> {
  const [c, alt] = await Promise.all([getContent(domain), getAltText(domain)]);
  let busy = false;
  if (hasAudit && (!c || isOlderThan(c.runAt, FREE_REFRESH_DAYS) || !c.inventory.length)) busy = prepare(`content:${domain}`, () => runContent(domain, 'team')) || busy;
  if (hasAudit && (!alt || isOlderThan(alt.runAt, FREE_REFRESH_DAYS))) busy = prepare(`alt-text:${domain}`, () => runAltText(domain, 'team')) || busy;
  return busy;
}

export async function autoTracking(domain: string): Promise<boolean> {
  const ws = await getTracking(domain);
  return !ws.audit || isOlderThan(ws.audit.runAt, FREE_REFRESH_DAYS) ? prepare(`tracking:${domain}`, () => runTracking(domain, 'team')) : false;
}

export async function autoAeo(domain: string): Promise<boolean> {
  const ws = await getAeo(domain);
  return ws.audit ? false : prepare(`aeo:${domain}`, () => runAeo(domain, 'customer'));
}

export async function autoLocal(domain: string): Promise<boolean> {
  return (await getLocal(domain)) ? false : prepare(`local:${domain}`, () => runLocal(domain, 'customer'));
}

export async function autoBacklinks(domain: string): Promise<boolean> {
  return (await getBacklinks(domain)).audit ? false : prepare(`backlinks:${domain}`, () => runBacklinks(domain, 'customer'));
}

/** Deep competitor analysis, once there is a shortlist. */
export async function autoAnalysis(domain: string): Promise<boolean> {
  const [a, ws] = await Promise.all([getAnalysis(domain), getSavedWorkspace(domain)]);
  if (a || !ws?.competitors.some((c) => c.shortlist !== 'none')) return false;
  return prepare(`analysis:${domain}`, () => runAnalysis(domain, 'customer'));
}

/** The first monitoring snapshot (weekly after that), when the month's budget allows the rank checks. */
export async function autoMonitor(domain: string): Promise<boolean> {
  const ws = await getMonitor(domain);
  if (ws.snapshots.length) return false;
  return prepare(`monitor:${domain}`, async () => {
    if (await underCap(WEEKLY_MONITOR_ESTIMATE_USD)) await runMonitorNow(domain);
  });
}

/**
 * Keywords prepared by autopilot, now instead of at its daily run: for a website with no keywords yet,
 * and for a second website whose research inputs are a copy of the first website's onboarding answers
 * (it then reads its own services and places from its pages and researches again). Needs a database.
 */
export async function autoKeywords(domain: string, account: Pick<Account, 'userId' | 'website' | 'services'>, hasAudit: boolean): Promise<boolean> {
  if (!hasAudit || !usingDatabase()) return false;
  const kw = await getKeywordWorkspace(domain);
  const primary = Boolean(account.website && domainOf(account.website) === domain);
  const same = (x: string[], y: string[]) => x.length > 0 && x.length === y.length && x.every((v, i) => v.toLowerCase() === y[i]!.toLowerCase());
  const copied = !primary && kw.keywords.length > 0 && same(kw.seeds.services, account.services);
  if (kw.keywords.length && !copied) return false;
  return prepare(
    `autopilot:${domain}`,
    async () => {
      const { runAutopilotNow } = await import('@seo/db');
      await runAutopilotNow(account.userId, domain, { rederive: copied });
    },
    copied ? 7 * DAY : 6 * 60 * 60_000,
  );
}

/** 12.x for customers: every finding and page-plan topic is in the 6-month plan without clicking. */
export async function autoActionPlan(domain: string): Promise<ActionWorkspace> {
  const [ws, ctx] = await Promise.all([getActions(domain), planContext(domain, false)]);
  const next = autoPlan(ws, ctx.report, ctx.mapping, { gsc: ctx.gsc, newId: randomUUID });
  if (!next) return ws;
  await saveActions(next);
  return next;
}
