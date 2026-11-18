'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  addTopicKeyword, briefHtml, createOpenAiClient, draftableRows, fromMappingRow, moveKeyword, normDomain, updateMappingRow, upsertPageChanges, writeDrafts,
  type ConflictPlan, type MappingAction, type MappingStatus,
} from '@seo/core';
import { getActions, planContext, saveActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';
import { customerAudits } from '@/lib/customer-data';
import { getKeywordWorkspace, logUsage } from '@/lib/keywords';
import { brandFor, fixCounts, getMapping, loadPageMap, rebuildMapping, refreshChecks, saveMapping } from '@/lib/mapping';
import { providerConfig } from '@/lib/providers-config';
import { hit } from '@/lib/rate-limit';

/** Module 5 actions, shared by the team's and the customer's page plans. */
export type MappingState = { error?: string; ok?: string };

const ACTIONS: MappingAction[] = ['optimise', 'expand', 'merge', 'create', 'leave'];
const STATUSES: MappingStatus[] = ['todo', 'in_progress', 'live', 'verified'];
const pathsFor = (domain: string) => {
  revalidatePath(`/keywords/${domain}`);
  revalidatePath('/my/keywords');
};
const planPaths = (domain: string) => {
  revalidatePath(`/action-plan/${domain}`);
  revalidatePath('/my/actions');
  revalidatePath('/my/approvals');
};

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, customer: viewer.kind === 'customer' };
}

/** 5.1–5.11 Rebuild from the latest audit, the keyword topics and Search Console. Free. */
export async function rebuildMappingAction(rawDomain: string): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const r = await rebuildMapping(domain);
  pathsFor(domain);
  if (r.problem === 'no-topics') return { error: 'Research keywords first: the page plan maps each keyword topic to a page.' };
  if (r.problem === 'no-audit') return { error: 'Run a new audit first: the page plan needs the pages from an audit made after 17 November 2026.' };
  const created = r.ws.rows.filter((x) => x.action === 'create').length;
  return { ok: `${r.ws.rows.length} topics mapped${created ? `, ${created} need a new page` : ''}.${r.ws.usedSearchConsole ? ' Search Console clicks were used to pick pages.' : ''}` };
}

/** 5.8 AI drafts for up to 10 unapproved rows. Customers: twice a day. */
export async function writeDraftsAction(rawDomain: string): Promise<MappingState> {
  const { domain, customer } = await guard(rawDomain);
  const openai = providerConfig().env?.openai;
  if (!openai) return { error: 'AI drafts are not available right now. The template drafts can be edited by hand.' };
  const ws = await getMapping(domain);
  if (!ws.rows.length) return { error: 'Build the page plan first.' };
  const keywords = await getKeywordWorkspace(domain);
  const rows = draftableRows(ws, keywords.keywords);
  if (!rows.length) return { ok: 'Every row is approved or written already.' };
  if (customer && !(await hit(`mapping-drafts:${domain}`, 2, 24 * 60 * 60)).allowed) return { error: 'AI drafts can be written twice a day.' };
  const pages = (await customerAudits(`https://${domain}/`)).latest?.pages ?? [];
  try {
    const r = await writeDrafts(createOpenAiClient(openai), rows, {
      brand: await brandFor(domain),
      place: keywords.businessType === 'shop' ? null : keywords.seeds.locations[0] ?? null,
      keywords: keywords.keywords,
      currentTitles: Object.fromEntries(pages.map((p) => [p.url, p.title])),
    });
    let next = ws;
    for (const [id, d] of Object.entries(r.drafts)) next = updateMappingRow(next, id, { drafts: { ...d, source: 'ai', approved: false } });
    await saveMapping(next);
    await logUsage('openai', r.tokens);
    pathsFor(domain);
    return { ok: `${Object.keys(r.drafts).length} drafts written. Review and approve each one.` };
  } catch (err) {
    return { error: `AI drafts failed: ${err instanceof Error ? err.message : 'please try again'}.` };
  }
}

/** Hand edits for one row: page, action, owner, status and the drafts (with approval). */
export async function updateMappingRowAction(rawDomain: string, clusterId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const ws = await getMapping(domain);
  const row = ws.rows.find((r) => r.clusterId === clusterId);
  if (!row) return { error: 'This topic is no longer in the plan. Rebuild it.' };
  const action = form.get('action') as MappingAction | null;
  const status = form.get('status') as MappingStatus | null;
  const pageRaw = form.get('url');
  const url = typeof pageRaw === 'string' ? (pageRaw === '__new' ? null : pageRaw || undefined) : undefined;
  if (url && !/^https?:\/\//.test(url)) return { error: 'Choose a page from the list.' };
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v.trim() : undefined;
  };
  await saveMapping(
    updateMappingRow(ws, clusterId, {
      ...(action && ACTIONS.includes(action) ? { action } : {}),
      ...(status && STATUSES.includes(status) ? { status } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(form.has('owner') ? { owner: text('owner') ?? null } : {}),
      ...(form.has('title') ? { drafts: { title: text('title'), h1: text('h1'), meta: text('meta'), approved: form.get('approved') === 'on' } } : {}),
    }),
  );
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** 5.4 Confirm the main page of a topic two pages compete for, and what happens to the other page. */
export async function settleConflictAction(rawDomain: string, clusterId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const ws = await getMapping(domain);
  const row = ws.rows.find((r) => r.clusterId === clusterId);
  if (!row) return { error: 'This topic is no longer in the plan. Rebuild it.' };
  const main = String(form.get('main') ?? '');
  const plan: ConflictPlan = form.get('plan') === 'merge' ? 'merge' : 'differentiate';
  const options = [row.url, ...row.conflicts.map((c) => c.url)].filter(Boolean) as string[];
  if (!options.includes(main)) return { error: 'Choose one of the pages.' };
  let next = main !== row.url ? updateMappingRow(ws, clusterId, { url: main }) : ws;
  next = updateMappingRow(next, clusterId, { settle: plan });
  await saveMapping(next);
  pathsFor(domain);
  return { ok: plan === 'merge' ? 'Main page confirmed. The merge goes to approvals with the other fixes.' : 'Main page confirmed. The other page gets a different keyword.' };
}

/** 5.2 / 5.3 Choose the page for a topic ("Use an existing page", "Change page"), or mark it as new. */
export async function choosePageAction(rawDomain: string, clusterId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const raw = String(form.get('url') ?? '');
  const url = raw === '__new' ? null : raw;
  if (url !== null && !/^https?:\/\//.test(url)) return { error: 'Choose a page from the list.' };
  if (url && normDomain(new URL(url).hostname) !== domain) return { error: 'Choose a page on this website.' };
  const ws = await getMapping(domain);
  if (!ws.rows.some((r) => r.clusterId === clusterId)) return { error: 'This topic is no longer in the plan. Rebuild it.' };
  await saveMapping(updateMappingRow(ws, clusterId, { url }));
  pathsFor(domain);
  return { ok: url ? 'Page saved.' : 'Marked as a new page.' };
}

/** "Move" a keyword to the topic (page) it fits better. */
export async function moveKeywordAction(rawDomain: string, term: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const to = String(form.get('to') ?? '');
  const ws = await getMapping(domain);
  const target = ws.rows.find((r) => r.clusterId === to);
  if (!target) return { error: 'Choose a topic.' };
  await saveMapping(moveKeyword(ws, term, to));
  pathsFor(domain);
  return { ok: `Moved to “${target.topic}”.` };
}

/** "+ Add keyword" on the one-page map (no search data; it is checked on the page like the others). */
export async function addPageKeywordAction(rawDomain: string, clusterId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain, customer } = await guard(rawDomain);
  const term = String(form.get('term') ?? '').trim();
  if (term.length < 3) return { error: 'Type a keyword.' };
  const ws = await getMapping(domain);
  if (!ws.rows.some((r) => r.clusterId === clusterId)) return { error: 'This topic is no longer in the plan.' };
  if (customer && !(await hit(`mapping-add:${domain}`, 30, 24 * 60 * 60)).allowed) return { error: 'You can add 30 keywords a day.' };
  await saveMapping(addTopicKeyword(ws, term, clusterId));
  pathsFor(domain);
  return { ok: 'Added. The page is checked for it now.' };
}

/** Edit one drafted fix (title, H1 and meta go to the drafts; the others are kept as edits). */
export async function editFixAction(rawDomain: string, clusterId: string, fixId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const text = String(form.get('text') ?? '').trim();
  if (!text) return { error: 'Type the new text.' };
  const ws = await getMapping(domain);
  if (!ws.rows.some((r) => r.clusterId === clusterId)) return { error: 'This topic is no longer in the plan.' };
  const patch = fixId === 'title' ? { drafts: { title: text } } : fixId === 'h1' ? { drafts: { h1: text } } : fixId === 'meta' ? { drafts: { meta: text } } : { edit: { id: fixId, text } };
  await saveMapping(updateMappingRow(ws, clusterId, patch));
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** 5.6 Confirm the search intent fits the page. */
export async function confirmIntentAction(rawDomain: string, clusterId: string): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const ws = await getMapping(domain);
  await saveMapping(updateMappingRow(ws, clusterId, { intentConfirmed: true }));
  pathsFor(domain);
  return { ok: 'Confirmed.' };
}

/** Check the live page again (after it was changed). */
export async function recheckPageAction(rawDomain: string, clusterId: string): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const r = await loadPageMap(domain, clusterId, { recheck: true });
  pathsFor(domain);
  if (!r) return { error: 'This topic is no longer in the plan.' };
  return r.checkFailed ? { error: 'The page could not be loaded. Try again in a minute.' } : { ok: 'Page checked.' };
}

/** Sends the chosen fixes of one page (or a new page's brief) to the action plan, where they wait for approval. */
async function sendPage(domain: string, clusterId: string, pick: Set<string> | null) {
  const r = await loadPageMap(domain, clusterId);
  if (!r) return 0;
  const changes = r.row.url
    ? r.fixes.filter((f) => !pick || pick.has(f.id)).map((f) => ({ id: f.id, label: f.label, now: f.now, suggested: f.suggested }))
    : r.brief
      ? [{
          id: 'brief',
          label: 'New page',
          now: 'No page yet',
          suggested: `${r.brief.pageType} at ${r.brief.path}: ${r.brief.title}`,
          data: { path: r.brief.path, title: r.brief.title, h1: r.brief.h1, meta: r.brief.meta, html: briefHtml(r.brief) },
        }]
      : [];
  if (!changes.length) return 0;
  const [plan, ctx] = await Promise.all([getActions(domain), planContext(domain, true)]);
  await saveActions(upsertPageChanges(plan, fromMappingRow(r.row), changes, { report: ctx.report, gsc: ctx.gsc, newId: randomUUID }));
  await saveMapping(updateMappingRow(await getMapping(domain), clusterId, { sentAt: new Date().toISOString() }));
  return changes.length;
}

/** "Send N fixes to approvals" on the one-page map (or "Send brief to approvals" for a new page). */
export async function sendFixesAction(rawDomain: string, clusterId: string, _prev: MappingState, form: FormData): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  const brief = form.has('brief');
  const pick = new Set(form.getAll('fix').map(String));
  if (!pick.size && !brief) return { error: 'Tick at least one fix.' };
  const n = await sendPage(domain, clusterId, brief ? null : pick);
  pathsFor(domain);
  planPaths(domain);
  if (!n) return { error: 'Nothing to send.' };
  return { ok: brief ? 'Sent to approvals: the new page waits for your yes.' : `${n} ${n === 1 ? 'fix' : 'fixes'} sent to approvals. Nothing changes on the site until they are approved.` };
}

/** "Send fixes to approvals" on the overview: every mapped page whose conflict is settled. */
export async function sendAllFixesAction(rawDomain: string): Promise<MappingState> {
  const { domain } = await guard(rawDomain);
  await refreshChecks(domain, (await getMapping(domain)).rows.filter((r) => r.url && !(r.conflicts.length && !r.conflictSettled)).map((r) => r.clusterId));
  const ws = await getMapping(domain);
  const counts = await fixCounts(ws);
  const ready = ws.rows.filter((r) => r.url && (counts[r.clusterId] ?? 0) > 0 && !(r.conflicts.length && !r.conflictSettled));
  let pages = 0;
  let changes = 0;
  for (const r of ready) {
    const n = await sendPage(domain, r.clusterId, null);
    if (n) [pages, changes] = [pages + 1, changes + n];
  }
  pathsFor(domain);
  planPaths(domain);
  return changes ? { ok: `${changes} fixes for ${pages} ${pages === 1 ? 'page' : 'pages'} sent to approvals.` } : { error: 'No drafted fixes to send yet. Settle the conflicts first.' };
}
