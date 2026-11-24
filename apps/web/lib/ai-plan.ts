import { randomUUID } from 'node:crypto';
import { AI_PLAN_CUSTOMER_COOLDOWN_DAYS, AI_PLAN_EVERY_DAYS, capacityFor, createOpenAiClient, planExtrasFrom, providerConfig, writeAiPlan, type ActionWorkspace, type PlanTier } from '@seo/core';
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

export async function rewriteAiPlan(domain: string, opts: { fresh?: boolean } = {}): Promise<{ ok: string } | { error: string }> {
  const openai = providerConfig().env?.openai;
  if (!openai) return { error: 'The AI plan needs an OpenAI key on this server.' };
  const keywords = await freshKeywords(domain);
  const [mapping, ctx, settings, who, gscRows, backlinks, local, ws, aeo, content] = await Promise.all([
    freshMapping(domain),
    planContext(domain, true),
    appSettings(),
    tierOf(domain),
    gscQueryPages(domain),
    getBacklinks(domain).catch(() => null),
    getLocal(domain).catch(() => null),
    getActions(domain),
    getAeo(domain).catch(() => null),
    getContent(domain).catch(() => null),
  ]);
  if (!ctx.report) return { error: 'Run an audit first: the plan is built from its findings.' };
  try {
    const now = new Date();
    const { workspace, tokens } = await writeAiPlan(
      createOpenAiClient(openai),
      ws,
      {
        domain, tier: who.tier, capacity: capacityFor(settings, who.tier), keywords, mapping, report: ctx.report, country: keywords.country, priorities: who.priorities, start: now,
        extras: planExtrasFrom({ gsc: gscRows.length ? gscRows : null, backlinks, local, aeo, content }),
      },
      { newId: randomUUID, now, report: ctx.report, gsc: ctx.gsc, fresh: opts.fresh },
    );
    await saveActions(workspace);
    if (usingDatabase()) {
      const { prisma } = await import('@seo/db');
      await prisma.apiUsage.create({ data: { provider: 'openai', endpoint: 'tokens', units: tokens } }).catch(() => undefined);
    }
    const tasks = workspace.actions.filter((a) => a.source.kind === 'ai' && a.source.planId === workspace.aiPlan?.id).length;
    return { ok: `${opts.fresh ? 'Plan regenerated' : 'New 6-month plan written'}: ${tasks} tasks.` };
  } catch (err) {
    return { error: `The AI plan could not be written: ${err instanceof Error ? err.message : String(err)}` };
  }
}
