'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { runLocal } from '@/lib/local';

/** Module 9 actions (team and the site's customer). */
export type LocalState = { error?: string; ok?: string };

export async function runLocalAction(rawDomain: string): Promise<LocalState> {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  const r = await runLocal(domain, viewer.kind === 'customer' ? 'customer' : 'team');
  revalidatePath(`/local/${domain}`);
  revalidatePath('/my/local');
  if (r.problem === 'not-configured') return { error: 'The local audit is not set up on this server (DataForSEO).' };
  if (r.problem === 'too-soon') return { error: `You can run this once a month. Next run: ${r.next!.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.` };
  if (r.problem === 'cap') return { error: 'This month’s budget for automatic research is used up. It resets on the 1st.' };
  if (r.problem === 'failed') return { error: `The local audit did not finish: ${r.message}` };
  const a = r.audit!;
  if (!a.profile) return { ok: 'Done, but no Google Business Profile was found for this business. See the notes.' };
  return { ok: `Done: profile ${a.completeness?.score ?? 0}% complete${a.grid ? `, map grid for ${a.grid.searches.length} searches` : ''}${a.pending.reviews ? '; reviews are still loading, open this page again in a few minutes' : ''}.` };
}
