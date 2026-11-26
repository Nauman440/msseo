import 'server-only';
import {
  appendEmailLog, dailyAverage, dueCheckpoint, gscSearchAnalytics, judgeResult, laterHealthCheck, plannedEmails, runDue, updateAction,
  type PlannedEmail, type ResultCheck, type WorkItem,
} from '@seo/core';
import { wordpressSession } from '@seo/core/server';
import { accountSites, domainOf, listAccounts } from './accounts';
import { getActions, saveActions } from './actions';
import { autopilotBlocker, autopilotRunning, getAutopilot, saveAutopilot, startImplementing, type AutopilotState } from './autopilot-wp';
import { getConnection, listConnections, saveConnection } from './connections';
import { getInventory } from './inventory';
import { gscAccess } from './keywords';
import { emailLayout, mailReady, notifyTeam, sendMail } from './mailer';
import { appSettings } from './settings';
import { SITE_URL } from './site';

/**
 * The WordPress autopilot's clock (phases 4–5). Called every 15 minutes (worker job, or a timer in
 * the web server without a worker). For each connected WordPress site it:
 *  1. starts today's scheduled run (Mon–Fri at the site's run time, when "Run by itself" is on);
 *  2. checks the homepage and the changed pages again an hour after a run, undoing the run if one got worse;
 *  3. measures each change at 7, 14 and 28 days in Search Console and undoes one that hurt rankings;
 *  4. sends the emails the customer must act on (and the Friday and monthly summaries).
 * Every step is safe to repeat; nothing runs twice.
 */
const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LAG_DAYS = 3;

async function fetchPage(url: string) {
  const u = `${url}${url.includes('?') ? '&' : '?'}msscore_check=${Date.now()}`;
  const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MSScore-Check/1.0)' }, signal: AbortSignal.timeout(20_000) });
  return { status: r.status, html: r.status === 200 ? await r.text() : '', location: r.headers.get('location') };
}

/** Undoes changes through the plugin; returns those it could undo. */
async function undo(domain: string, items: WorkItem[], reason: string): Promise<Set<string>> {
  const conn = await getConnection(domain);
  const done = new Set<string>();
  if (!conn) return done;
  const { wp } = await wordpressSession(conn, { save: saveConnection });
  for (const it of [...items].reverse()) {
    const r = await wp.rollback(it.id, reason).catch(() => null);
    if (r?.status === 'rolled_back') done.add(it.id);
  }
  return done;
}

/** 2. An hour after a run: homepage + changed pages again. */
async function laterCheck(s: AutopilotState): Promise<AutopilotState> {
  const run = s.runs[0];
  if (!run || run.laterCheck || !run.applied || run.rolledBack || Date.now() - Date.parse(run.finishedAt) < HOUR) return s;
  const home = Object.keys(run.baselineWords ?? {})[0];
  const urls = [...new Set([home, ...(run.changedPages ?? [])].filter((u): u is string => Boolean(u)))];
  const problems = await laterHealthCheck(urls, new Map(Object.entries(run.baselineWords ?? {})), { fetchPage }).catch(() => [] as string[]);
  let items = s.items;
  if (problems.length) {
    const inRun = items.filter((i) => i.appliedAt && i.appliedAt >= run.startedAt && i.appliedAt <= run.finishedAt && ['applied', 'verified'].includes(i.status));
    const undone = await undo(s.domain, inRun, 'page got worse after the run');
    items = items.map((i) => (undone.has(i.id) ? { ...i, status: 'rolled_back' as const, reason: `Undone automatically: ${problems[0]}` } : i));
  }
  const runs = [{ ...run, laterCheck: { at: new Date().toISOString(), ok: !problems.length, problems } }, ...s.runs.slice(1)];
  return { ...s, items, runs, ...(problems.length ? { status: 'paused' as const, pausedReason: problems.join(' ') } : {}) };
}

/** 3. Results at 7, 14 and 28 days (Search Console page data, the page against its own 28 days before). */
async function resultChecks(s: AutopilotState): Promise<{ s: AutopilotState; harmed: WorkItem[] }> {
  const due = s.items.map((i) => ({ i, day: dueCheckpoint(i) })).filter((x): x is { i: WorkItem; day: number } => x.day !== null).slice(0, 20);
  if (!due.length) return { s, harmed: [] };
  const access = await gscAccess(s.domain);
  const now = new Date();
  const harmed: WorkItem[] = [];
  const results = new Map<string, ResultCheck>();
  for (const { i, day } of due) {
    const at = new Date(i.appliedAt!);
    const beforeStart = new Date(at.getTime() - 28 * 86_400_000);
    const afterEnd = new Date(now.getTime() - LAG_DAYS * 86_400_000);
    const afterStart = new Date(at.getTime() + 86_400_000);
    let check: ResultCheck = { day, at: now.toISOString(), before: { clicks: 0, impressions: 0, position: null }, after: { clicks: 0, impressions: 0, position: null }, verdict: 'too_little_data', rolledBack: false };
    if (access && afterEnd > afterStart) {
      try {
        const [b, a] = await Promise.all([
          gscSearchAnalytics(access.token, access.property, { startDate: iso(beforeStart), endDate: iso(at), dimensions: ['date'], page: i.url!, maxRows: 100 }),
          gscSearchAnalytics(access.token, access.property, { startDate: iso(afterStart), endDate: iso(afterEnd), dimensions: ['date'], page: i.url!, maxRows: 100 }),
        ]);
        const before = dailyAverage(b, 28);
        const after = dailyAverage(a, Math.round((afterEnd.getTime() - afterStart.getTime()) / 86_400_000) + 1);
        check = { ...check, before, after, verdict: judgeResult(before, after) };
      } catch {
        // Search Console did not answer; measured again on the next tick (the checkpoint is not recorded).
        continue;
      }
    }
    if (check.verdict === 'worse') harmed.push(i);
    results.set(i.id, check);
  }
  const undone = harmed.length ? await undo(s.domain, harmed, 'Google rankings dropped after this change') : new Set<string>();
  const items = s.items.map((i) => {
    const c = results.get(i.id);
    if (!c) return i;
    const rolled = undone.has(i.id);
    return { ...i, checks: [...(i.checks ?? []), { ...c, rolledBack: rolled }], ...(rolled ? { status: 'rolled_back' as const, reason: `Undone after ${c.day} days: the page dropped from position ${c.before.position} to ${c.after.position} and lost clicks.` } : {}) };
  });
  return { s: { ...s, items }, harmed: harmed.filter((h) => undone.has(h.id)) };
}

/** 4. Emails: what the customer must act on, critical problems, Friday and monthly summaries. */
async function emails(s: AutopilotState, harmed: WorkItem[], customerEmail: string | null): Promise<AutopilotState> {
  // Without an email provider nothing is planned (so nothing is "owed" when one is added later, apart from new events).
  if (!mailReady()) return s;
  const conn = await getConnection(s.domain);
  const inv = await getInventory(s.accountId, s.domain);
  const today = new Date().toISOString().slice(0, 10);
  const problems = [
    ...(conn && conn.status !== 'ok' ? [{ key: `conn:${today}`, message: `MS SCORE cannot reach the WordPress website: ${conn.error ?? 'the connection needs attention'}. Nothing is changed until it is fixed (Connections tab).` }] : []),
    ...(inv && !inv.status.search_visible ? [{ key: `hidden:${today.slice(0, 7)}`, message: 'WordPress is set to “Discourage search engines from indexing this site” (Settings → Reading), so Google is asked not to show it. Untick it unless the site is not ready yet.' }] : []),
    ...harmed.map((h) => ({ key: `rank:${h.id}`, message: `We undid “${h.label}”: the page lost Google rankings after the change.` })),
  ];
  const path = customerEmail ? `/my/content?site=${encodeURIComponent(s.domain)}` : `/action-plan/${s.domain}`;
  const planned = plannedEmails({ domain: s.domain, items: s.items, runs: s.runs, log: s.emails, mode: s.settings.mode, timezone: s.settings.timezone, problems, path });
  let log = s.emails;
  const origin = (process.env.APP_URL || SITE_URL).replace(/\/$/, '');
  for (const e of planned) {
    const body = emailLayout({ heading: e.heading, paragraphs: e.paragraphs, button: { label: 'Open the Changes tab', href: `${origin}${team(e) ? `/action-plan/${s.domain}` : e.path}` } });
    let ok = false;
    let to = '';
    if (team(e) || !customerEmail) {
      // Team sites and team copies of critical problems; summaries for team sites are not sent.
      if (e.kind !== 'critical' && e.kind !== 'action_needed') continue;
      to = 'team';
      await notifyTeam(e.subject, body);
      ok = Boolean(process.env.TEAM_NOTIFY_EMAIL?.trim());
    } else {
      to = customerEmail;
      ok = await sendMail(customerEmail, e.subject, body);
    }
    log = appendEmailLog(log, { key: e.key, kind: e.kind, to, subject: e.subject, sentAt: new Date().toISOString(), ok });
  }
  return { ...s, emails: log };
}
const team = (e: PlannedEmail) => e.audience === 'team';

/** Marks plan tasks back to "in progress" when one of their changes was undone. */
async function reopenTasks(domain: string, items: WorkItem[]) {
  const ws = await getActions(domain);
  let next = ws;
  for (const a of ws.actions) {
    if ((a.status === 'done' || a.status === 'verified') && items.some((i) => i.actionId === a.id && i.status === 'rolled_back' && i.reason?.startsWith('Undone'))) next = updateAction(next, a.id, { status: 'in_progress' });
  }
  if (next !== ws) await saveActions(next);
}

export async function autopilotTick(): Promise<{ sites: number; started: string[]; problems: string[] }> {
  const settings = await appSettings();
  const conns = (await listConnections()).filter((c) => c.platform === 'wordpress');
  const accounts = await listAccounts().catch(() => []);
  const started: string[] = [];
  const problems: string[] = [];
  for (const c of conns) {
    try {
      let s = await getAutopilot(c.domain);
      if (autopilotRunning(c.domain) || s.status === 'running') continue;
      const owner = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === c.domain));
      const customerEmail = owner && owner.status !== 'cancelled' ? owner.email : null;
      // Cancelled customers: nothing is scheduled.
      if (owner && owner.status === 'cancelled') continue;
      const before = s.items.filter((i) => i.status === 'rolled_back').length;
      s = await laterCheck(s);
      const r = await resultChecks(s);
      s = r.s;
      s = await emails(s, r.harmed, customerEmail);
      await saveAutopilot(s);
      if (s.items.filter((i) => i.status === 'rolled_back').length !== before) await reopenTasks(c.domain, s.items);
      if (settings['autopilot.wpEnabled'] && s.status !== 'paused' && runDue(s.settings, s.lastRunDate)) {
        const blocker = await autopilotBlocker(c.domain);
        if (blocker) {
          problems.push(`${c.domain}: ${blocker}`);
          continue;
        }
        const st = await startImplementing(c.domain, 'Schedule', { scheduled: true });
        if (st.started) started.push(c.domain);
      }
    } catch (err) {
      problems.push(`${c.domain}: ${err instanceof Error ? err.message.slice(0, 160) : 'error'}`);
    }
  }
  return { sites: conns.length, started, problems };
}
