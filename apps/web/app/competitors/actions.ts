'use server';

import { revalidatePath } from 'next/cache';
import {
  addManualCompetitor, COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, createCompetitorClient, discoverCompetitors, MAX_SEARCHES, normDomain, refreshStrength,
  removeCompetitor, updateCompetitor, type CompetitorType, type Shortlist,
} from '@seo/core';
import { competitorAccess, getWorkspace, logCompetitorCost, saveWorkspace } from '@/lib/competitors';
import { providerConfig } from '@/lib/providers-config';
import { hit } from '@/lib/rate-limit';

/** Module 3 actions, shared by the team's and the customer's competitor pages. */
export type CompetitorState = { error?: string; ok?: string };

const TYPES: CompetitorType[] = ['direct', 'search', 'local', 'directory', 'publisher'];
const SHORTLISTS: Shortlist[] = ['none', 'direct', 'aspirational'];
const pathsFor = (domain: string) => {
  revalidatePath(`/competitors/${domain}`);
  revalidatePath('/my/competitors');
};

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, viewer };
}

function client() {
  const { env } = providerConfig();
  if (!env) return null;
  let calls = 0;
  return { calls: () => calls, api: createCompetitorClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) }) };
}

/** Country, language and the core searches (3.3). */
export async function saveCompetitorSettingsAction(rawDomain: string, _prev: CompetitorState, form: FormData): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  const country = String(form.get('country') ?? '');
  const language = String(form.get('language') ?? '');
  const searches = [...new Set(form.getAll('searches').map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
  if (!(COMPETITOR_COUNTRIES as readonly string[]).includes(country)) return { error: 'Choose a country from the list.' };
  if (!(language in COMPETITOR_LANGUAGES)) return { error: 'Choose a language from the list.' };
  if (!searches.length) return { error: 'Add at least one search your customers type (press Enter after each).' };
  if (searches.length > MAX_SEARCHES) return { error: `Keep it to ${MAX_SEARCHES} searches.` };
  const ws = await getWorkspace(domain);
  await saveWorkspace({ ...ws, country, language, searches: searches.map((s) => s.slice(0, 80)) });
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** 3.2–3.5 Find competitors (Labs + live searches + local pack). Customers: 2 runs a day. */
export async function findCompetitorsAction(rawDomain: string): Promise<CompetitorState> {
  const { domain, viewer } = await guard(rawDomain);
  const ws = await getWorkspace(domain);
  if (!ws.searches.length) return { error: 'Add the searches your customers type first, then save.' };
  if (viewer.kind === 'customer' && !(await hit(`competitors-find:${domain}`, 2, 24 * 60 * 60)).allowed) return { error: 'You can look for competitors twice a day. Please try again tomorrow.' };
  const c = client();
  if (!c) return { error: 'Competitor search is not available right now.' };
  const r = await discoverCompetitors(c.api, ws);
  await saveWorkspace(r.workspace);
  await logCompetitorCost(c.calls(), r.cost);
  pathsFor(domain);
  const found = r.workspace.competitors.length;
  if (!found && r.errors.length) return { error: `The search did not work: ${r.errors[0]}` };
  return { ok: `${found} websites found${r.newDomains.length ? `, ${r.newDomains.length} new since last time` : ''}.${r.errors.length ? ` (${r.errors.length} searches could not be read.)` : ''}` };
}

/** 3.8 Strength snapshot for the shortlist. Customers: once a day. */
export async function refreshStrengthAction(rawDomain: string): Promise<CompetitorState> {
  const { domain, viewer } = await guard(rawDomain);
  const ws = await getWorkspace(domain);
  if (!ws.competitors.some((x) => x.shortlist !== 'none')) return { error: 'Shortlist some competitors first.' };
  if (viewer.kind === 'customer' && !(await hit(`competitors-strength:${domain}`, 1, 24 * 60 * 60)).allowed) return { error: 'Strength can be refreshed once a day.' };
  const c = client();
  if (!c) return { error: 'Not available right now.' };
  const r = await refreshStrength(c.api, ws);
  await saveWorkspace(r.workspace);
  await logCompetitorCost(c.calls(), r.cost);
  pathsFor(domain);
  return r.errors.length ? { error: `Some could not be read: ${r.errors[0]}` } : { ok: 'Strength updated.' };
}

/** 3.5 type override, 3.6 shortlist and notes for one competitor. */
export async function updateCompetitorAction(rawDomain: string, competitor: string, _prev: CompetitorState, form: FormData): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  const type = form.get('type') as CompetitorType | null;
  const shortlist = form.get('shortlist') as Shortlist | null;
  const notes = form.get('notes');
  const ws = await getWorkspace(domain);
  await saveWorkspace(
    updateCompetitor(ws, competitor, {
      ...(type && TYPES.includes(type) ? { type } : {}),
      ...(shortlist && SHORTLISTS.includes(shortlist) ? { shortlist } : {}),
      ...(typeof notes === 'string' ? { notes } : {}),
    }),
  );
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** 3.1 Add a competitor by hand. */
export async function addCompetitorAction(rawDomain: string, _prev: CompetitorState, form: FormData): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  const competitor = normDomain(String(form.get('domain') ?? ''));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(competitor)) return { error: 'Enter a website, for example rival.com' };
  if (competitor === domain) return { error: 'That is your own website.' };
  const type = form.get('type') as CompetitorType | null;
  const ws = await getWorkspace(domain);
  await saveWorkspace(addManualCompetitor(ws, { domain: competitor, name: String(form.get('name') ?? '').trim() || null, ...(type && TYPES.includes(type) ? { type } : {}) }));
  pathsFor(domain);
  return { ok: `${competitor} added.` };
}

export async function removeCompetitorAction(rawDomain: string, competitor: string): Promise<void> {
  const { domain } = await guard(rawDomain);
  await saveWorkspace(removeCompetitor(await getWorkspace(domain), competitor));
  pathsFor(domain);
}
