import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  applyHoldList, createOpenAiClient, DEFAULT_AUTOPILOT_SETTINGS, draftAltTexts, fetchPageContents, generateWorkItems, GscSubmitError, gscSubmitSitemap, localParts, normDomain, pageKey, pageKeywordMap,
  planMonthWindow, pluginSupportsApply, PLUGIN_TYPES, runWorkItems, timezoneFor, todaysShare, updateAction, validTimezone,
  type ActionWorkspace, type AutopilotSettings, type BusinessProfile, type EmailLogEntry, type RunSummary, type WorkItem, type WpChangeType,
} from '@seo/core';
import { wordpressSession } from '@seo/core/server';
import { currentPlanMonth, monthOf, planStart } from '@/components/actions/PlanMonths';
import { accountSites, domainOf, listAccounts, siteProfile } from './accounts';
import { getActions, saveActions } from './actions';
import { getAltText } from './alt-text';
import { usingDatabase } from './audit-store';
import { prepare, isPreparing } from './auto';
import { checkConnection, getConnection, saveConnection } from './connections';
import { customerAudits } from './customer-data';
import { accountIdFor, refreshInventory, getInventory } from './inventory';
import { getAeo, runAeo } from './aeo';
import { getKeywordWorkspace, gscAccess, logUsage, researchCompetitors } from './keywords';
import { updateMonitor } from './monitor';
import { getMapping } from './mapping';
import { providerConfig } from './providers-config';

/**
 * "Start implementing plan" (Changes tab and the team's action plan): prepares this month's exact
 * changes (phase 3) and applies the ready ones through the WordPress plugin, checking each on the live
 * page (phase 4 engine). Stored per account and website (AutopilotSite; a file without a database).
 */
export type AutopilotState = {
  accountId: string;
  domain: string;
  status: 'idle' | 'running' | 'paused';
  step: string | null;
  pausedReason: string | null;
  month: number | null;
  items: WorkItem[];
  runs: RunSummary[];
  notes: string[];
  error: string | null;
  updatedAt: string | null;
  /** Per-site schedule and safety settings (phase 4). Older saved states get the defaults. */
  settings: AutopilotSettings;
  /** Local date (site time zone) of the last scheduled run, so it runs once a working day. */
  lastRunDate: string | null;
  /** Emails sent about this site (phase 5), newest first. */
  emails: EmailLogEntry[];
};

const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'autopilot');
const safe = (s: string) => s.replace(/[^a-z0-9.-]/gi, '');
const file = (accountId: string, domain: string) => resolve(DIR, `${safe(accountId)}__${safe(domain)}.json`);
const empty = (accountId: string, domain: string): AutopilotState => ({ accountId, domain, status: 'idle', step: null, pausedReason: null, month: null, items: [], runs: [], notes: [], error: null, updatedAt: null, settings: { ...DEFAULT_AUTOPILOT_SETTINGS }, lastRunDate: null, emails: [] });
const filled = (s: AutopilotState): AutopilotState => ({ ...s, settings: { ...DEFAULT_AUTOPILOT_SETTINGS, ...(s.settings ?? {}) }, lastRunDate: s.lastRunDate ?? null, emails: s.emails ?? [] });

export async function getAutopilot(rawDomain: string): Promise<AutopilotState> {
  const domain = normDomain(rawDomain);
  const accountId = await accountIdFor(domain);
  if (usingDatabase()) {
    const { getAutopilotSite } = await import('@seo/db');
    const got = await getAutopilotSite<AutopilotState>(accountId, domain).catch(() => null);
    return got ? filled(got) : await withTimezone(empty(accountId, domain));
  }
  try {
    const s = JSON.parse(await readFile(file(accountId, domain), 'utf8')) as AutopilotState;
    return s.accountId === accountId && s.domain === domain ? filled(s) : await withTimezone(empty(accountId, domain));
  } catch {
    return await withTimezone(empty(accountId, domain));
  }
}

/** A new site's time zone comes from the customer's country (sign-up answer). */
async function withTimezone(s: AutopilotState): Promise<AutopilotState> {
  const account = (await listAccounts().catch(() => [])).find((a) => accountSites(a).some((w) => domainOf(w) === s.domain));
  return { ...s, settings: { ...s.settings, timezone: timezoneFor(account?.country) } };
}

export async function saveAutopilot(s: AutopilotState): Promise<void> {
  const next = { ...s, updatedAt: new Date().toISOString() };
  if (usingDatabase()) {
    const { saveAutopilotSite } = await import('@seo/db');
    await saveAutopilotSite(s.accountId, s.domain, next);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const target = file(s.accountId, s.domain);
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(next));
  await rename(tmp, target);
}

const runKey = (domain: string) => `autopilot-run:${domain}`;
export const autopilotRunning = (domain: string) => isPreparing(runKey(normDomain(domain)));

/** Why the button cannot run yet, in plain words (null = it can). */
export async function autopilotBlocker(rawDomain: string): Promise<string | null> {
  let c = await getConnection(normDomain(rawDomain));
  if (!c || c.platform !== 'wordpress') return 'Connect your WordPress website first (Connections tab).';
  // The stored plugin version is from the last check; after a plugin update, check again (at most every 2 minutes).
  if (!pluginSupportsApply(c.plugin?.version) && Date.now() - new Date(c.checkedAt).getTime() > 2 * 60_000) c = await checkConnection(c);
  if (c.status !== 'ok') return c.error ?? 'The website connection needs attention (Connections tab).';
  if (!pluginSupportsApply(c.plugin?.version)) return 'Install or update the MS SCORE Connector plugin to version 1.2 or later (Connections tab).';
  const ws = await getActions(normDomain(rawDomain));
  if (!ws.actions.length) return 'There is no plan yet.';
  return null;
}

async function fetchPage(url: string): Promise<{ status: number; html: string; location: string | null }> {
  const u = `${url}${url.includes('?') ? '&' : '?'}msscore_check=${Date.now()}`;
  const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MSScore-Check/1.0)' }, signal: AbortSignal.timeout(20_000) });
  return { status: r.status, html: r.status === 200 ? await r.text() : '', location: r.headers.get('location') };
}

/** Marks plan tasks done when every website change they need is made (or already right). */
function settleActions(ws: ActionWorkspace, items: WorkItem[]): ActionWorkspace {
  let next = ws;
  for (const a of ws.actions) {
    const mine = items.filter((i) => i.actionId === a.id && PLUGIN_TYPES.includes(i.type as WpChangeType));
    if (!mine.length || a.status === 'done' || a.status === 'verified' || a.status === 'dismissed') continue;
    const finished = mine.every((i) => ['applied', 'verified', 'keep', 'skipped'].includes(i.status));
    const started = mine.some((i) => ['applied', 'verified'].includes(i.status));
    if (finished) next = updateAction(next, a.id, { status: 'done' });
    else if (started && a.status === 'todo') next = updateAction(next, a.id, { status: 'in_progress' });
  }
  return next;
}

async function robotsOf(home: string): Promise<string | null | undefined> {
  try {
    const r = await fetch(new URL('/robots.txt', home), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MSScore-Check/1.0)' }, signal: AbortSignal.timeout(15_000) });
    return r.ok ? await r.text() : null;
  } catch {
    return undefined;
  }
}

/** Changes a person undid on the WordPress admin page become "undone" here too. */
async function syncWordPressUndos(wp: { changes(page?: number): Promise<{ change_id: string; status: string }[]> }, items: WorkItem[]): Promise<WorkItem[]> {
  const undone = new Set<string>();
  for (let page = 1; page <= 3; page++) {
    const list = await wp.changes(page).catch(() => []);
    for (const c of list) if (c.status === 'rolled_back') undone.add(c.change_id);
    if (list.length < 50) break;
  }
  return items.map((i) => (undone.has(i.id) && ['applied', 'verified'].includes(i.status) ? { ...i, status: 'rolled_back' as const, reason: 'Undone in WordPress (MS SCORE Autopilot page).' } : i));
}

/** MS SCORE's own steps: submit the sitemap, switch on the weekly page check, check AI assistants. */
async function internalItems(domain: string, items: WorkItem[], customer: boolean): Promise<WorkItem[]> {
  const now = new Date().toISOString();
  const sitemapPending = items.some((i) => i.type === 'sitemap' && i.status === 'draft');
  const out: WorkItem[] = [];
  for (const i of items) {
    if (i.status !== 'draft' || !['gsc_sitemap_submit', 'weekly_page_check', 'ai_visibility_check'].includes(i.type)) {
      out.push(i);
      continue;
    }
    try {
      if (i.type === 'gsc_sitemap_submit') {
        if (sitemapPending) {
          out.push({ ...i, reason: 'Waits until the new sitemap is live.' });
          continue;
        }
        const access = await gscAccess(domain);
        const feed = (i.newValue as { sitemap?: string } | null)?.sitemap ?? i.url;
        if (!access || !feed) {
          out.push({ ...i, status: 'needs_human', reason: `Search Console is not connected for this site. Connect it (Connections tab), or add ${feed ?? 'the sitemap'} in Search Console → Sitemaps.` });
          continue;
        }
        await gscSubmitSitemap(access.token, access.property, feed);
        out.push({ ...i, status: 'verified', appliedAt: now, verifiedAt: now, reason: `Submitted to Search Console (${access.property}).` });
      } else if (i.type === 'weekly_page_check') {
        await updateMonitor(domain, (ws) => {
          ws.enabled = true;
        });
        out.push({ ...i, status: 'verified', appliedAt: now, verifiedAt: now, reason: 'Weekly monitoring is on: new and changed pages, rankings and alerts.' });
      } else {
        const last = (await getAeo(domain)).audit?.runAt;
        if (last && Date.now() - Date.parse(last) < 25 * 86_400_000) {
          out.push({ ...i, status: 'verified', appliedAt: now, verifiedAt: now, reason: `AI assistants were checked on ${last.slice(0, 10)}.` });
          continue;
        }
        const r = await runAeo(domain, customer ? 'customer' : 'team');
        out.push(r.ws ? { ...i, status: 'verified', appliedAt: now, verifiedAt: now, reason: 'AI assistants checked (AI search).' } : { ...i, reason: r.problem === 'cap' ? 'Waits for next month’s budget.' : r.problem === 'not-configured' ? 'AI search checks are not set up on this server.' : (r.message ?? 'Will try again on the next run.') });
      }
    } catch (err) {
      const reason = err instanceof GscSubmitError
        ? `${err.message} Add ${(i.newValue as { sitemap?: string } | null)?.sitemap ?? 'the sitemap'} in Search Console → Sitemaps (one minute), or reconnect Google with write access.`
        : `Will try again on the next run: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`;
      out.push({ ...i, status: err instanceof GscSubmitError && err.status === 403 ? 'needs_human' : 'draft', reason });
    }
  }
  return out;
}

async function job(domain: string, by: string, opts: { scheduled?: boolean } = {}): Promise<void> {
  let s = await getAutopilot(domain);
  const step = async (text: string) => {
    s = { ...s, status: 'running', step: text, error: null };
    await saveAutopilot(s);
  };
  try {
    await step('Reading every page on your website');
    const conn = await getConnection(domain);
    if (!conn) throw new Error('The website is not connected.');
    const { wp } = await wordpressSession(conn, { save: saveConnection });
    s = { ...s, items: await syncWordPressUndos(wp, s.items) };
    let inventory = await getInventory(s.accountId, domain);
    inventory = inventory && Date.now() - new Date(inventory.refreshedAt).getTime() < 6 * 3600_000 ? inventory : (await refreshInventory(domain)).inventory;

    await step('Preparing this month’s changes');
    const [actions, kw, mapping, audits, rivals, alt, accounts] = await Promise.all([
      getActions(domain), getKeywordWorkspace(domain), getMapping(domain), customerAudits(`https://${domain}/`), researchCompetitors(domain), getAltText(domain), listAccounts(),
    ]);
    const month = currentPlanMonth(actions);
    const monthActions = actions.actions.filter((a) => monthOf(a) === month);
    const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
    const site = siteProfile(account, domain);
    const profile: BusinessProfile = {
      name: site.businessName,
      places: [...new Set([...kw.seeds.locations, ...site.areas])],
      brands: kw.seeds.brands,
      services: [...new Set([...kw.seeds.services, ...site.services])],
      bannedWords: [],
      competitors: [...new Set([...rivals.names, ...site.competitors])].filter((x) => x.length > 2),
    };
    const pages = inventory.items.filter((i) => i.url && !i.noindex && ['page', 'post', 'product'].includes(i.type)).map((i) => i.url!);
    const live = await fetchPageContents(pages.slice(0, 60));
    const openai = providerConfig().env?.openai;
    const ai = openai ? createOpenAiClient(openai) : null;
    let altTokens = 0;
    const dead = (audits.latest?.issues ?? []).filter((i) => i.ruleId === '1.5.1').flatMap((i) => i.urls.map((url) => ({ url, why: 'The audit found it answers 404 but pages still link to it' })));
    const keywords = new Map(Object.entries(pageKeywordMap(mapping)).map(([k, v]) => [pageKey(`https://${k}`), v]));
    const home0 = inventory.items.find((i) => i.isFrontPage)?.url ?? inventory.status.home_url;
    const robotsTxt = await robotsOf(home0);
    const gen = await generateWorkItems({
      accountId: s.accountId, domain, actions: monthActions, inventory, live, profile, keywords, deadUrls: dead.slice(0, 50), robotsTxt,
      altDrafts: new Map((alt?.drafts ?? []).map((d) => [d.src, d.alt])),
      ai,
      draftAlt: ai ? async (list) => {
        const r = await draftAltTexts(ai, list, kw.businessType === 'shop' ? 'online shop' : 'service business');
        altTokens += r.tokens;
        return r.drafts.map((d) => ({ src: d.src, alt: d.alt }));
      } : undefined,
    });
    if (gen.tokens + altTokens) await logUsage('openai', gen.tokens + altTokens);
    // Changes already made keep their record; everything else is replaced by the fresh drafts.
    // Approvals carry over to the same exact change (same id).
    const kept = new Map(s.items.filter((i) => ['applied', 'verified', 'rolled_back'].includes(i.status) || (i.status === 'needs_human' && i.type === 'gsc_sitemap_submit')).map((i) => [i.id, i]));
    const approved = new Map(s.items.filter((i) => i.approvedAt).map((i) => [i.id, i]));
    const fresh = gen.items.map((i) => kept.get(i.id) ?? (approved.has(i.id) ? { ...i, approvedAt: approved.get(i.id)!.approvedAt, approvedBy: approved.get(i.id)!.approvedBy } : i));
    let items = applyHoldList([...fresh, ...[...kept.values()].filter((i) => !gen.items.some((g) => g.id === i.id))], s.settings.holdList);
    s = { ...s, month, items, notes: gen.notes };
    await saveAutopilot(s);

    await step('Making the changes on your website');
    const home = inventory.items.find((i) => i.isFrontPage)?.url ?? inventory.status.home_url;
    const keyPages = [home, ...items.filter((i) => i.status === 'draft' && i.url && !i.type.startsWith('redirect')).map((i) => i.url!)];
    const firstRun = !s.items.some((i) => ['applied', 'verified', 'rolled_back'].includes(i.status)) && !s.runs.some((r) => r.undoTested);
    // A scheduled run spreads the month's ready changes over the working days left in the plan month.
    const requireApproval = s.settings.mode === 'approve';
    const readyCount = items.filter((i) => i.status === 'draft' && PLUGIN_TYPES.includes(i.type as WpChangeType) && (!requireApproval || i.approvedAt)).length;
    const start = planStart(actions);
    const monthEnd = start ? planMonthWindow(start, month).end : new Date(Date.now() + 20 * 86_400_000);
    const cap = opts.scheduled ? todaysShare(readyCount, new Date(), monthEnd, s.settings.timezone, s.settings.dailyCap) : s.settings.dailyCap;
    const r = await runWorkItems(items, { wp, fetchPage }, { keyPages, firstRun, cap, requireApproval });
    items = r.items;
    if (!r.run.paused) {
      await step('Submitting the sitemap and setting up checks');
      items = await internalItems(domain, items, Boolean(account));
    }
    s = { ...s, items, runs: [{ ...r.run, by }, ...s.runs].slice(0, 30), status: r.run.paused ? 'paused' : 'idle', step: null, pausedReason: r.run.paused ? r.run.problems.join(' ') : null, ...(opts.scheduled ? { lastRunDate: localParts(new Date(), s.settings.timezone).date } : {}) };
    await saveAutopilot(s);
    await saveActions(settleActions(await getActions(domain), items));
  } catch (err) {
    s = { ...s, status: 'idle', step: null, error: err instanceof Error ? err.message.slice(0, 300) : 'Something went wrong.', ...(opts.scheduled ? { lastRunDate: localParts(new Date(), s.settings.timezone).date } : {}) };
    await saveAutopilot(s);
  }
}

/** Starts a run in the background. False when one is already running. */
export async function startImplementing(rawDomain: string, by: string, opts: { scheduled?: boolean } = {}): Promise<{ started: boolean; problem?: string }> {
  const domain = normDomain(rawDomain);
  const blocker = await autopilotBlocker(domain);
  if (blocker) return { started: false, problem: blocker };
  if (autopilotRunning(domain)) return { started: false, problem: 'Already running. This page updates by itself.' };
  const s = await getAutopilot(domain);
  await saveAutopilot({ ...s, status: 'running', step: 'Starting', error: null, pausedReason: s.status === 'paused' ? null : s.pausedReason });
  prepare(runKey(domain), () => job(domain, by, opts), 60_000);
  return { started: true };
}

/** Saves the site's schedule and safety settings. */
export async function saveAutopilotSettings(rawDomain: string, patch: Partial<AutopilotSettings>): Promise<AutopilotState> {
  const s = await getAutopilot(rawDomain);
  const next: AutopilotSettings = { ...s.settings, ...patch };
  if (!validTimezone(next.timezone)) next.timezone = s.settings.timezone;
  next.runHour = Math.min(23, Math.max(0, Math.round(next.runHour)));
  next.dailyCap = Math.min(30, Math.max(1, Math.round(next.dailyCap)));
  next.holdList = [...new Set(next.holdList.map((h) => h.trim()).filter(Boolean))].slice(0, 100);
  // Holding a page also holds its waiting changes at once.
  const out = { ...s, settings: next, items: applyHoldList(s.items, next.holdList), ...(s.status === 'paused' && patch.enabled ? { status: 'idle' as const, pausedReason: null } : {}) };
  await saveAutopilot(out);
  return out;
}

/** Approve mode: approves one change, or every change waiting ('all'). */
export async function approveWorkItems(rawDomain: string, ids: string[] | 'all', by: string): Promise<number> {
  const s = await getAutopilot(rawDomain);
  const at = new Date().toISOString();
  let n = 0;
  const items = s.items.map((i) => {
    if (i.status !== 'draft' || i.approvedAt || !PLUGIN_TYPES.includes(i.type as WpChangeType)) return i;
    if (ids !== 'all' && !ids.includes(i.id)) return i;
    n++;
    return { ...i, approvedAt: at, approvedBy: by };
  });
  await saveAutopilot({ ...s, items });
  return n;
}

/** Undoes one change on the website. */
export async function undoWorkItem(rawDomain: string, id: string): Promise<{ ok?: string; error?: string }> {
  const domain = normDomain(rawDomain);
  const s = await getAutopilot(domain);
  const it = s.items.find((i) => i.id === id);
  if (!it || !['applied', 'verified'].includes(it.status)) return { error: 'This change is not on the website.' };
  const conn = await getConnection(domain);
  if (!conn) return { error: 'The website is not connected.' };
  const { wp } = await wordpressSession(conn, { save: saveConnection });
  const r = await wp.rollback(id, 'undone by a person');
  if (r.status !== 'rolled_back') return { error: r.reason ?? 'The website could not undo it; it may have been edited since.' };
  const items = s.items.map((i) => (i.id === id ? { ...i, status: 'rolled_back' as const, reason: 'Undone by a person.' } : i));
  await saveAutopilot({ ...s, items });
  const ws = await getActions(domain);
  const a = ws.actions.find((x) => x.id === it.actionId);
  if (a && (a.status === 'done' || a.status === 'verified')) await saveActions(updateAction(ws, a.id, { status: 'in_progress' }));
  return { ok: `Undone: ${it.label}.` };
}
