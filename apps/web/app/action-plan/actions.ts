'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { ACTION_BUCKETS, actionKey, addActions, normDomain, suggestions, updateAction, type ActionPatch, type ActionStatus, type Approval, type Bucket } from '@seo/core';
import { getActions, planContext, saveActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';

/** Module 12 actions, shared by the team's and the customer's action plans. */
export type ActionState = { error?: string; ok?: string };

const STATUSES: ActionStatus[] = ['todo', 'in_progress', 'done', 'dismissed'];
const APPROVALS: Approval[] = ['none', 'team_lead', 'client'];
const BUCKETS: Bucket[] = ACTION_BUCKETS;

const pathsFor = (domain: string) => {
  revalidatePath(`/action-plan/${domain}`);
  revalidatePath('/my/actions');
  revalidatePath('/my/approvals');
};

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, viewer, customer: viewer.kind === 'customer' };
}

/** 12.2 "Create actions from top issues": the 10 highest-priority suggestions (or the one picked). */
export async function addActionsAction(rawDomain: string, key: string | null): Promise<ActionState> {
  const { domain } = await guard(rawDomain);
  const [ws, ctx] = await Promise.all([getActions(domain), planContext(domain, true)]);
  const all = suggestions(ws, ctx.report, ctx.mapping);
  if (!all.length) return ctx.report ? { ok: 'Every finding is in the plan already.' } : { error: 'Run an audit first: actions come from its findings and the page plan.' };
  const picks = key ? all.filter((s) => actionKey(s.source) === key) : all.slice(0, 10);
  if (!picks.length) return { error: 'That finding is already in the plan.' };
  await saveActions(addActions(ws, picks, { report: ctx.report, gsc: ctx.gsc, newId: randomUUID }));
  pathsFor(domain);
  return { ok: picks.length === 1 ? 'Added to the plan.' : `${picks.length} actions added to the plan.` };
}

/** 12.4 owner, due date, approval level, roadmap month and status (customers: status only). */
export async function updateActionAction(rawDomain: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { domain, customer } = await guard(rawDomain);
  const ws = await getActions(domain);
  if (!ws.actions.some((a) => a.id === id)) return { error: 'This action is no longer in the plan.' };
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v.trim() : undefined;
  };
  const status = text('status') as ActionStatus | undefined;
  const approval = text('approval') as Approval | undefined;
  const bucket = text('bucket') as Bucket | undefined;
  const patch: ActionPatch = { ...(status && STATUSES.includes(status) ? { status } : {}) };
  if (!customer) {
    if (form.has('owner')) patch.owner = text('owner') ?? null;
    if (form.has('dueDate')) patch.dueDate = text('dueDate') || null;
    if (approval && APPROVALS.includes(approval)) patch.approval = approval;
    if (bucket && BUCKETS.includes(bucket)) patch.bucket = bucket;
    if (text('title')) patch.title = text('title');
  }
  await saveActions(updateAction(ws, id, patch));
  pathsFor(domain);
  return { ok: patch.status === 'done' ? 'Marked done. We will check the results after 7, 14 and 28 days.' : 'Saved.' };
}

/**
 * 12.4 Approvals: the customer approves what waits for the client; the team approves team-lead
 * items and can record a client's approval given by email or phone.
 */
export async function approveActionAction(rawDomain: string, id: string): Promise<ActionState> {
  const { domain, viewer, customer } = await guard(rawDomain);
  const ws = await getActions(domain);
  const a = ws.actions.find((x) => x.id === id);
  if (!a || a.approval === 'none' || a.approvedAt) return { error: 'Nothing to approve.' };
  if (customer && a.approval !== 'client') return { error: 'Our team approves this one.' };
  const by = customer ? `${viewer.user.name || 'Client'} (client)` : `${viewer.user.name || viewer.user.email || 'Team'}${a.approval === 'client' ? ' for the client' : ''}`;
  await saveActions(updateAction(ws, id, { approve: { by } }));
  pathsFor(domain);
  return { ok: 'Approved.' };
}

/** "Write the plan with AI" / "Rewrite plan": the team any time, customers once a week. */
export async function rewriteAiPlanAction(rawDomain: string): Promise<ActionState> {
  const { domain, customer } = await guard(rawDomain);
  const { getActions: load } = await import('@/lib/actions');
  const { nextAiPlan, planWriting, startAiPlan } = await import('@/lib/ai-plan');
  const ws = await load(domain);
  if (planWriting(ws)) return { ok: 'The plan is being written now.' };
  const next = nextAiPlan(ws, customer ? 'customer' : 'team');
  if (next) return { error: `A new plan can be written from ${next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.` };
  startAiPlan(domain);
  pathsFor(domain);
  return { ok: WRITING };
}

/** Temporary "Regenerate plan" (Settings switch): a brand-new plan now, for anyone who can see the plan, no weekly limit. */
export async function regeneratePlanAction(rawDomain: string): Promise<ActionState> {
  const { domain } = await guard(rawDomain);
  const { getActions: load } = await import('@/lib/actions');
  const { planWriting, regenerateEnabled, startAiPlan } = await import('@/lib/ai-plan');
  if (!(await regenerateEnabled())) return { error: 'Regenerating plans is switched off.' };
  if (planWriting(await load(domain))) return { ok: 'The plan is being written now.' };
  startAiPlan(domain, { fresh: true });
  pathsFor(domain);
  return { ok: WRITING };
}

const WRITING = 'Writing the new plan: it takes about 5–10 minutes. This page shows each step and updates itself.';
