'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { runAnalysis } from '@/lib/analysis';
import { competitorAccess } from '@/lib/competitors';

/** Module 6: start a deep competitor analysis (team any time; customers once a month per site). */
export type AnalysisState = { error?: string; ok?: string };

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export async function runAnalysisAction(rawDomain: string): Promise<AnalysisState> {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  try {
    const r = await runAnalysis(domain, viewer.kind);
    revalidatePath(`/competitors/${domain}`);
    revalidatePath('/my/competitors');
    if (r.problem === 'not-configured') return { error: 'The analysis is not available right now.' };
    if (r.problem === 'no-shortlist') return { error: 'Shortlist at least one competitor first (Direct or Aspirational).' };
    if (r.problem === 'too-soon') return { error: `You can run the analysis once a month. The next one is available on ${day(r.next!)}.` };
    if (r.problem === 'cap') return { error: 'This month’s budget for automatic research is used up. Our team can run the analysis for you.' };
    const a = r.analysis!;
    return { ok: `Analysis ready: ${a.sites.length - 1} competitors compared${a.ai ? `, ${a.ai.rows.length} ChatGPT questions` : ''}.${viewer.kind === 'team' ? ` Cost $${a.costUsd.toFixed(2)}.` : ''}${a.notes.length ? ` ${a.notes.length} ${a.notes.length === 1 ? 'step' : 'steps'} could not finish (see below).` : ''}` };
  } catch (err) {
    return { error: `The analysis did not finish: ${err instanceof Error ? err.message : 'please try again'}.` };
  }
}
