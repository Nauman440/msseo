import { randomUUID } from 'node:crypto';
import { planStillWriting, AI_PLAN_CUSTOMER_COOLDOWN_DAYS, AI_PLAN_EVERY_DAYS, capacityFor, createOpenAiClient, planExtrasFrom, providerConfig, writeAiPlan, type ActionWorkspace, type PlanTier } from '@seo/core';
import { accountSites, domainOf, listAccounts } from './accounts';
import { getActions, planContext, saveActions } from './actions';
import { getAeo } from './aeo';
import { getBacklinks } from './backlinks';
import { getContent } from './content';
import { usingDatabase } from './audit-store';
import { freshKeywords, gscQueryPages } from './keywords';
import { getLocal } from './local';
import { freshMapping } from './mapping';
import { appSettings } from './settings';
import { getAltText } from './alt-text';
import { prepare } from './auto';
import { getSavedWorkspace } from './competitors';

/**
 * The AI-written 6-month action plan for one website (Module 12): gathers what the tool knows (audit,
 * keywords, page plan, Search Console, backlinks, Business Profile), asks OpenAI with the plan rules,
 * checks the answer and replaces the untouched actions with its tasks.
 */
export const aiPlanAvailable = () => Boolean(providerConfig().env?.openai);

/** Customer websites follow their plan; the team's client sites use Growth. */
async function tierOf(domain: string): Promise<{ tier: PlanTier; priorities: string[] }> {
  const account = (await listAccounts().catch(() => [])).find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  if (!account) return { tier: 'growth', priorities: [] };
  const primary = Boolean(account.website && domainOf(account.website) === domain);
  return { tier: account.plan === 'autopilot' ? 'autopilot' : 'growth', priorities: primary ? account.services.slice(0, 5) : [] };
}

/** When the plan may be written again: customers once a week, autopilot monthly; null = now. */
export function nextAiPlan(ws: ActionWorkspace, audience: 'team' | 'customer', now = new Date()): Date | null {
  if (audience === 'team' || !ws.aiPlan) return null;
  const next = new Date(Date.parse(ws.aiPlan.generatedAt) + AI_PLAN_CUSTOMER_COOLDOWN_DAYS * 86_400_000);
  return next > now ? next : null;
}
export const aiPlanDue = (ws: ActionWorkspace, now = new Date()) =>
  !ws.aiPlan || now.getTime() - Date.parse(ws.aiPlan.generatedAt) > AI_PLAN_EVERY_DAYS * 86_400_000;

/** Whether the temporary "Regenerate plan" button shows (Settings → Audit settings). */
export async function regenerateEnabled(): Promise<boolean> {
  return aiPlanAvailable() && (await appSettings())['plan.regenerateButton'];
}

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/** Saves where the background writer is (or why it failed) on the latest copy of the workspace. */
async function setStatus(domain: string, status: ActionWorkspace['aiPlanStatus']): Promise<void> {
  const ws = await getActions(domain);
  await saveActions({ ...ws, aiPlanStatus: status ? { ...status, updatedAt: new Date().toISOString() } : null });
}

/**
 * Writes the plan with the staged strategist prompt (several OpenAI calls, a few minutes). Progress and a
 * failure reason are saved on the workspace, so the page can show them; it never throws.
 */
export async function rewriteAiPlan(domain: string, opts: { fresh?: boolean } = {}): Promise<{ ok: string } | { error: string }> {
  const openai = providerConfig().env?.openai;
  if (!openai) return { error: 'The AI plan needs an OpenAI key on this server.' };
  const startedAt = new Date().toISOString();
  await setStatus(domain, { state: 'writing', step: 'Collecting the site’s data', startedAt });
  try {
    const keywords = await freshKeywords(domain);
    const [mapping, ctx, settings, who, gscRows, backlinks, local, aeo, content, competitors, alt] = await Promise.all([
      freshMapping(domain),
      planContext(domain, true),
      appSettings(),
      tierOf(domain),
      gscQueryPages(domain),
      getBacklinks(domain).catch(() => null),
      getLocal(domain).catch(() => null),
      getAeo(domain).catch(() => null),
      getContent(domain).catch(() => null),
      getSavedWorkspace(domain).catch(() => null),
      getAltText(domain).catch(() => null),
    ]);
    if (!ctx.report) {
      await setStatus(domain, { state: 'failed', step: 'Waiting for an audit', startedAt, message: 'Run an audit first: the plan is built from its findings.' });
      return { error: 'Run an audit first: the plan is built from its findings.' };
    }
    const altDrafts = new Map<string, { image: string; alt: string }[]>();
    for (const d of alt?.drafts ?? []) altDrafts.set(norm(d.page), [...(altDrafts.get(norm(d.page)) ?? []), { image: d.src, alt: d.alt }]);
    const watched = (competitors?.competitors ?? []).filter((c) => c.shortlist !== 'none').map((c) => (c.name ? `${c.name} (${c.domain})` : c.domain));
    const now = new Date();
    const { workspace, tokens } = await writeAiPlan(
      createOpenAiClient(openai),
      await getActions(domain),
      {
        domain, tier: who.tier, capacity: capacityFor(settings, who.tier), keywords, mapping, report: ctx.report, country: keywords.country, priorities: who.priorities, start: now,
        extras: { ...planExtrasFrom({ gsc: gscRows.length ? gscRows : null, backlinks, local, aeo, content }), competitors: watched },
      },
      { newId: randomUUID, now, report: ctx.report, gsc: ctx.gsc, fresh: opts.fresh, altDrafts, onProgress: (step) => setStatus(domain, { state: 'writing', step, startedAt }) },
    );
    // Actions changed by a person while the plan was written are kept as they are now.
    const latest = await getActions(domain);
    const changed = new Map(latest.actions.filter((a) => a.updatedAt > startedAt).map((a) => [a.id, a]));
    await saveActions({ ...workspace, actions: workspace.actions.map((a) => changed.get(a.id) ?? a), aiPlanStatus: null });
    if (usingDatabase()) {
      const { prisma } = await import('@seo/db');
      await prisma.apiUsage.create({ data: { provider: 'openai', endpoint: 'tokens', units: tokens } }).catch(() => undefined);
    }
    const tasks = workspace.actions.filter((a) => a.source.kind === 'ai' && a.source.planId === workspace.aiPlan?.id).length;
    const passed = workspace.aiPlan?.validation?.filter((v) => v.pass).length ?? 0;
    return { ok: `${opts.fresh ? 'Plan regenerated' : 'New 6-month plan written'}: ${tasks} tasks, ${passed} of ${workspace.aiPlan?.validation?.length ?? 0} checks pass.` };
  } catch (err) {
    const message = `The AI plan could not be written: ${err instanceof Error ? err.message : String(err)}`;
    await setStatus(domain, { state: 'failed', step: 'Stopped', startedAt, message }).catch(() => undefined);
    return { error: message };
  }
}

/** Starts writing in the background (one run per site at a time); false when one is already running. */
export function startAiPlan(domain: string, opts: { fresh?: boolean } = {}): boolean {
  return prepare(`aiplan:${domain}`, () => rewriteAiPlan(domain, opts), 0);
}
/** A writer that has said nothing for 20 minutes has stopped (server restart): it no longer blocks. */
export const planWriting = (ws: ActionWorkspace) => planStillWriting(ws.aiPlanStatus);
