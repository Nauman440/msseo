'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { startImplementing, undoWorkItem } from '@/lib/autopilot-wp';

/** "Start implementing plan" and per-change undo, for the team and the site's customer. */
export type AutopilotActionState = { ok?: string; error?: string };

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, by: viewer.kind === 'customer' ? 'Client' : 'Team' };
}
const paths = (domain: string) => {
  revalidatePath('/my/content');
  revalidatePath(`/action-plan/${domain}`);
};

export async function startImplementingAction(rawDomain: string): Promise<AutopilotActionState> {
  const { domain, by } = await guard(rawDomain);
  const r = await startImplementing(domain, by);
  paths(domain);
  return r.started ? { ok: 'Started. This page updates by itself while the changes are made.' } : { error: r.problem ?? 'Could not start.' };
}

export async function undoWorkItemAction(rawDomain: string, id: string): Promise<AutopilotActionState> {
  const { domain } = await guard(rawDomain);
  const r = await undoWorkItem(domain, id);
  paths(domain);
  return r;
}
