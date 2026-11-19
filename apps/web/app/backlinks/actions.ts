'use server';

import { revalidatePath } from 'next/cache';
import { addOutreach, normDomain, removeOutreach, updateOutreach, type OutreachSource, type OutreachStatus } from '@seo/core';
import { getBacklinks, runBacklinks, saveBacklinks } from '@/lib/backlinks';
import { competitorAccess } from '@/lib/competitors';

/** Module 8 actions (team and the site's customer). */
export type BacklinkState = { error?: string; ok?: string };

const STATUSES: OutreachStatus[] = ['todo', 'contacted', 'replied', 'won', 'lost'];
const SOURCES: OutreachSource[] = ['gap', 'mention', 'broken', 'local', 'manual'];
const paths = (domain: string) => {
  revalidatePath(`/backlinks/${domain}`);
  revalidatePath('/my/backlinks');
};
async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, by: viewer.kind === 'customer' ? ('customer' as const) : ('team' as const) };
}
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export async function runBacklinksAction(rawDomain: string): Promise<BacklinkState> {
  const { domain, by } = await guard(rawDomain);
  const r = await runBacklinks(domain, by);
  paths(domain);
  if (r.problem === 'not-configured') return { error: 'The backlink audit is not set up on this server (DataForSEO).' };
  if (r.problem === 'not-enabled') return { error: 'Backlink data is not switched on for the DataForSEO account yet (Backlinks API). Ask the team to enable it, then run again.' };
  if (r.problem === 'too-soon') return { error: `You can run this once a month. Next run: ${day(r.next!)}.` };
  if (r.problem === 'cap') return { error: 'This month’s budget for automatic research is used up. It resets on the 1st.' };
  if (r.problem === 'failed') return { error: `The backlink audit did not finish: ${r.message}` };
  const a = r.ws!.audit!;
  return { ok: `${(a.summary.referringDomains ?? 0).toLocaleString('en-US')} linking websites found${a.gap.length ? `, ${a.gap.length} link opportunities` : ''}.` };
}

/** 8.10 Adds a domain to the outreach list (from the gap, a mention, a broken link, local or by hand). */
export async function addOutreachAction(rawDomain: string, _prev: BacklinkState, form: FormData): Promise<BacklinkState> {
  const { domain } = await guard(rawDomain);
  const target = String(form.get('domain') ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(target)) return { error: 'Type a website, like example.com' };
  const source = SOURCES.includes(String(form.get('source')) as OutreachSource) ? (String(form.get('source')) as OutreachSource) : 'manual';
  const reason = String(form.get('reason') ?? '').slice(0, 200) || 'Added by hand';
  const url = String(form.get('url') ?? '') || null;
  const ws = await getBacklinks(domain);
  if (ws.outreach.some((o) => o.domain === target)) return { ok: 'Already on the outreach list.' };
  await saveBacklinks(addOutreach(ws, [{ domain: target, source, reason, url }]));
  paths(domain);
  return { ok: 'Added to the outreach list.' };
}

export async function updateOutreachAction(rawDomain: string, target: string, _prev: BacklinkState, form: FormData): Promise<BacklinkState> {
  const { domain } = await guard(rawDomain);
  const ws = await getBacklinks(domain);
  if (!ws.outreach.some((o) => o.domain === target)) return { error: 'This website is no longer on the list.' };
  const status = String(form.get('status') ?? '') as OutreachStatus;
  const text = (k: string) => (form.has(k) ? String(form.get(k) ?? '') : undefined);
  await saveBacklinks(updateOutreach(ws, target, { ...(STATUSES.includes(status) ? { status } : {}), contact: text('contact'), owner: text('owner'), notes: text('notes') }));
  paths(domain);
  return { ok: 'Saved.' };
}

export async function removeOutreachAction(rawDomain: string, target: string): Promise<BacklinkState> {
  const { domain } = await guard(rawDomain);
  await saveBacklinks(removeOutreach(await getBacklinks(domain), target));
  paths(domain);
  return { ok: 'Removed.' };
}
