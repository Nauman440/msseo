'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { runTracking, saveTrackingManual } from '@/lib/tracking';

/** Module 11 actions (team and the site's customer). */
export type TrackingState = { error?: string; ok?: string };

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, by: viewer.kind === 'customer' ? ('customer' as const) : ('team' as const) };
}
const paths = (domain: string) => {
  revalidatePath(`/tracking/${domain}`);
  revalidatePath('/my/tracking');
};

export async function runTrackingAction(rawDomain: string): Promise<TrackingState> {
  const { domain, by } = await guard(rawDomain);
  try {
    const r = await runTracking(domain, by);
    paths(domain);
    if (r.problem === 'too-often') return { error: 'You can run this check three times a day. Try again tomorrow.' };
    const checks = r.ws!.audit!.checks;
    const todo = checks.filter((c) => c.status === 'fail' || c.status === 'warn').length;
    return { ok: todo ? `Checked. ${todo} of ${checks.length} points need attention.` : `Checked. All ${checks.length} points look good.` };
  } catch (err) {
    return { error: `The check did not finish: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown error'}` };
  }
}

/** 11.7 Lead quality notes. */
export async function saveTrackingManualAction(rawDomain: string, _prev: TrackingState, form: FormData): Promise<TrackingState> {
  const { domain } = await guard(rawDomain);
  const matched = String(form.get('leadsMatched') ?? '');
  await saveTrackingManual(domain, {
    leadsMatched: matched === 'yes' ? true : matched === 'no' ? false : null,
    crm: String(form.get('crm') ?? '').trim().slice(0, 120),
    notes: String(form.get('notes') ?? '').trim().slice(0, 2000),
  });
  paths(domain);
  return { ok: 'Saved.' };
}
