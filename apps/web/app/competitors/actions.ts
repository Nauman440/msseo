'use server';

import { revalidatePath } from 'next/cache';
import {
  addManualCompetitor, COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, createCompetitorClient, discoverCompetitors, MAX_SEARCHES, normDomain, refreshStrength,
  removeCompetitor, updateCompetitor, type CompetitorType, type ListingStatus, type Shortlist,
} from '@seo/core';
import { competitorAccess, getWorkspace, logCompetitorCost, saveWorkspace } from '@/lib/competitors';
import { providerConfig } from '@/lib/providers-config';
import { hit } from '@/lib/rate-limit';

/** Module 3 actions, shared by the team's and the customer's competitor pages. */
export type CompetitorState = { error?: string; ok?: string };

const TYPES: CompetitorType[] = ['direct', 'search', 'local', 'directory', 'publisher'];
const SHORTLISTS: Shortlist[] = ['none', 'direct', 'aspirational'];
const LISTINGS: ListingStatus[] = ['unchecked', 'listed', 'not_listed', 'wrong', 'irrelevant'];
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
  const rejected = form.get('rejected');
  const listing = form.get('listing') as ListingStatus | null;
  const ws = await getWorkspace(domain);
  await saveWorkspace(
    updateCompetitor(ws, competitor, {
      ...(type && TYPES.includes(type) ? { type } : {}),
      ...(shortlist && SHORTLISTS.includes(shortlist) ? { shortlist } : {}),
      ...(typeof notes === 'string' ? { notes } : {}),
      ...(rejected === '1' || rejected === '0' ? { rejected: rejected === '1' } : {}),
      ...(listing && LISTINGS.includes(listing) ? { listing } : {}),
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
  const shortlist = form.get('shortlist') as Shortlist | null;
  let ws = addManualCompetitor(await getWorkspace(domain), { domain: competitor, name: String(form.get('name') ?? '').trim().slice(0, 80) || null, ...(type && TYPES.includes(type) ? { type } : {}) });
  if (shortlist === 'direct' || shortlist === 'aspirational') ws = updateCompetitor(ws, competitor, { shortlist });
  await saveWorkspace(ws);
  pathsFor(domain);
  return { ok: `${competitor} added.` };
}

export async function removeCompetitorAction(rawDomain: string, competitor: string): Promise<void> {
  const { domain } = await guard(rawDomain);
  await saveWorkspace(removeCompetitor(await getWorkspace(domain), competitor));
  pathsFor(domain);
}

/** Shortlist buttons: Direct, Aspirational, Not a competitor, or back to not reviewed (`none`). */
export async function setShortlistAction(rawDomain: string, competitor: string, choice: 'direct' | 'aspirational' | 'rejected' | 'none'): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  const ws = await getWorkspace(domain);
  const patch = choice === 'rejected' ? { rejected: true } : choice === 'none' ? { shortlist: 'none' as const, rejected: false } : { shortlist: choice };
  await saveWorkspace(updateCompetitor(ws, competitor, patch));
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** Listings and links: listed, not listed, details wrong, not relevant. */
export async function setListingAction(rawDomain: string, site: string, status: ListingStatus): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  if (!LISTINGS.includes(status)) return { error: 'Choose a status.' };
  await saveWorkspace(updateCompetitor(await getWorkspace(domain), site, { listing: status }));
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** A hidden site (job board, retailer, information) that is a competitor after all. */
export async function moveToCompetitorsAction(rawDomain: string, site: string): Promise<CompetitorState> {
  const { domain } = await guard(rawDomain);
  await saveWorkspace(updateCompetitor(await getWorkspace(domain), site, { type: 'direct' }));
  pathsFor(domain);
  return { ok: `${site} moved to competitors.` };
}
