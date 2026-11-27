'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { approveWorkItems, resetAutopilot, saveAutopilotSettings, setAutopilotPaused, startImplementing, undoWorkItem, redoWorkItem } from '@/lib/autopilot-wp';

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

export async function redoWorkItemAction(rawDomain: string, id: string): Promise<AutopilotActionState> {
  const { domain } = await guard(rawDomain);
  const r = await redoWorkItem(domain, id);
  paths(domain);
  return r;
}

export async function saveAutopilotSettingsAction(rawDomain: string, _prev: AutopilotActionState, form: FormData): Promise<AutopilotActionState> {
  const { domain } = await guard(rawDomain);
  const hold = String(form.get('holdList') ?? '').split(/[\n,]+/);
  await saveAutopilotSettings(domain, {
    enabled: form.get('enabled') === 'on',
    mode: form.get('mode') === 'approve' ? 'approve' : 'auto',
    timezone: String(form.get('timezone') ?? '').trim(),
    runHour: Number(form.get('runHour') ?? 9),
    dailyCap: Number(form.get('dailyCap') ?? 30),
    holdList: hold,
  });
  paths(domain);
  return { ok: 'Saved.' };
}

export async function approveWorkItemsAction(rawDomain: string, ids: string[] | 'all'): Promise<AutopilotActionState> {
  const { domain, by } = await guard(rawDomain);
  const n = await approveWorkItems(domain, ids, by);
  paths(domain);
  return n ? { ok: n === 1 ? 'Approved. It goes out on the next run.' : `${n} changes approved. They go out on the next runs.` } : { error: 'Nothing waiting for approval.' };
}

export async function resetAutopilotAction(rawDomain: string, _prev: AutopilotActionState, form: FormData): Promise<AutopilotActionState> {
  const { domain } = await guard(rawDomain);
  if (form.get('confirm') !== 'on') return { error: 'Tick the box to confirm.' };
  const r = await resetAutopilot(domain);
  paths(domain);
  return r;
}

/** Plan executor: only the next open task in plan order. */
export async function runNextTaskAction(rawDomain: string): Promise<AutopilotActionState> {
  const { domain, by } = await guard(rawDomain);
  const r = await startImplementing(domain, by, { onlyNext: true });
  paths(domain);
  return r.started ? { ok: 'Started the next task. This page updates by itself.' } : { error: r.problem ?? 'Could not start.' };
}

export async function pauseAutopilotAction(rawDomain: string, paused: boolean): Promise<AutopilotActionState> {
  const { domain, by } = await guard(rawDomain);
  await setAutopilotPaused(domain, paused, by === 'Client' ? 'you' : 'our team');
  paths(domain);
  return { ok: paused ? 'Paused. No changes go out until you resume.' : 'Resumed.' };
}
