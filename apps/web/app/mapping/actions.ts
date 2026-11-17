'use server';

import { revalidatePath } from 'next/cache';
import { createOpenAiClient, draftableRows, normDomain, updateMappingRow, writeDrafts, type MappingAction, type MappingStatus } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { customerAudits } from '@/lib/customer-data';
import { getKeywordWorkspace, logUsage } from '@/lib/keywords';
import { brandFor, getMapping, rebuildMapping, saveMapping } from '@/lib/mapping';
import { providerConfig } from '@/lib/providers-config';
import { hit } from '@/lib/rate-limit';

/** Module 5 actions, shared by the team's and the customer's page plans. */
export type MappingState = { error?: string; ok?: string };

const ACTIONS: MappingAction[] = ['optimise', 'expand', 'merge', 'create', 'leave'];
const STATUSES: MappingStatus[] = ['todo', 'in_progress', 'live', 'verified'];
const pathsFor = (domain: string) => {
  revalidatePath(`/mapping/${domain}`);
  revalidatePath('/my/pages');
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
