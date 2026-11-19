'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { runAeo } from '@/lib/aeo';
import { competitorAccess } from '@/lib/competitors';

/** Module 10 action (team and the site's customer). */
export type AeoState = { error?: string; ok?: string };
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export async function runAeoAction(rawDomain: string): Promise<AeoState> {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  const r = await runAeo(domain, viewer.kind === 'customer' ? 'customer' : 'team');
  revalidatePath(`/ai-search/${domain}`);
  revalidatePath('/my/ai-search');
  if (r.problem === 'not-configured') return { error: 'The AI search audit is not set up on this server (DataForSEO).' };
  if (r.problem === 'too-soon') return { error: `You can run this once a week (it also runs by itself every Monday). Next run: ${day(r.next!)}.` };
  if (r.problem === 'cap') return { error: 'This month’s budget for automatic research is used up. It resets on the 1st.' };
  if (r.problem === 'failed') return { error: `The AI search audit did not finish: ${r.message}` };
  const a = r.ws!.audit!;
  const you = a.share.all.find((s) => s.you);
  return { ok: a.answers.length ? `${a.answers.length} answers checked. You were named in ${you?.mentions ?? 0} of them.` : 'Checked. Tick questions under Keywords → Questions for AI to track them in AI assistants.' };
}
