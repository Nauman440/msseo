'use server';

import { revalidatePath } from 'next/cache';
import { applyChanges, checkVisible, fetchLivePage, normDomain, undoChanges, updateAction } from '@seo/core';
import { getActions, saveActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';
import { adapterFor, checkConnection, deleteConnection, getConnection } from '@/lib/connections';

/** Site connection actions (spec §16.5), shared by the team and customers. */
export type ConnectionState = { error?: string; ok?: string };

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, viewer, by: viewer.kind === 'customer' ? 'Client' : 'Team' };
}
const paths = (domain: string) => {
  revalidatePath(`/action-plan/${domain}`);
  revalidatePath('/my/actions');
  revalidatePath('/my/approvals');
  revalidatePath('/my/connections');
};

export async function checkConnectionAction(rawDomain: string): Promise<ConnectionState> {
  const { domain } = await guard(rawDomain);
  const c = await getConnection(domain);
  if (!c) return { error: 'No website is connected.' };
  const next = await checkConnection(c);
  paths(domain);
  return next.status === 'ok' ? { ok: next.platform === 'wordpress' && !next.plugin ? 'Connected. Install the MS SCORE Connector plugin to change SEO titles and descriptions.' : 'Connection works.' } : { error: next.error ?? 'The site did not answer.' };
}

export async function disconnectSiteAction(rawDomain: string): Promise<ConnectionState> {
  const { domain } = await guard(rawDomain);
  await deleteConnection(domain);
  paths(domain);
  return { ok: 'Disconnected. Nothing on your website was changed. You can also delete the MS SCORE application password (WordPress) or uninstall the app (Shopify).' };
}

/** Applies an approved action's changes to the connected site, then checks the live page. */
export async function applyToSiteAction(rawDomain: string, actionId: string): Promise<ConnectionState> {
  const { domain, by } = await guard(rawDomain);
  const [plan, c] = await Promise.all([getActions(domain), getConnection(domain)]);
  const a = plan.actions.find((x) => x.id === actionId);
  if (!a) return { error: 'This action is no longer in the plan.' };
  if (!c) return { error: 'Connect your website first (Connections).' };
  if (!a.changes?.length) return { error: 'This action has no changes to apply.' };
  if (a.approval !== 'none' && !a.approvedAt) return { error: 'Approve the action first.' };
  if (a.applied && !a.applied.undoneAt) return { error: 'Already applied. Undo it first to apply again.' };

  let record = await applyChanges(a, adapterFor(c), by);
  const live = a.urls[0] ? await fetchLivePage(a.urls[0]) : null;
  record = checkVisible(record, a, live);
  const applied = record.results.filter((r) => r.status === 'applied').length;
  const failed = record.results.filter((r) => r.status === 'failed').length;
  const manual = record.results.filter((r) => r.status === 'manual').length;
  let next = { ...plan, actions: plan.actions.map((x) => (x.id === a.id ? { ...x, applied: record } : x)) };
  // Everything applied: the action is done and its 7/14/28-day checks start.
  if (applied && !failed && !manual) next = updateAction(next, a.id, { status: 'done' });
  else if (applied) next = updateAction(next, a.id, { status: 'in_progress' });
  await saveActions(next);
  paths(domain);
  if (!applied) return { error: failed ? `Nothing was applied: ${record.results.find((r) => r.status === 'failed')?.note}` : 'These changes are all done by hand.' };
  return { ok: `${applied} applied${manual ? `, ${manual} to do by hand` : ''}${failed ? `, ${failed} failed` : ''}.` };
}

/** Puts back what was there before. */
export async function undoOnSiteAction(rawDomain: string, actionId: string): Promise<ConnectionState> {
  const { domain } = await guard(rawDomain);
  const [plan, c] = await Promise.all([getActions(domain), getConnection(domain)]);
  const a = plan.actions.find((x) => x.id === actionId);
  if (!a?.applied || a.applied.undoneAt) return { error: 'Nothing to undo.' };
  if (!c) return { error: 'The website is not connected any more, so the change cannot be undone from here.' };
  const record = await undoChanges(a.applied, a, adapterFor(c));
  let next = { ...plan, actions: plan.actions.map((x) => (x.id === a.id ? { ...x, applied: record } : x)) };
  next = updateAction(next, a.id, { status: 'todo' });
  await saveActions(next);
  paths(domain);
  const failed = record.results.filter((r) => /^Undo failed/.test(r.note)).length;
  return failed ? { error: `${failed} change${failed === 1 ? '' : 's'} could not be undone; see the notes.` } : { ok: 'Undone: your website is as it was.' };
}
