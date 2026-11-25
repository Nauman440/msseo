import { analysisTargets, siteQuestions, COUNTRY_ISO, createAiClient, createAnalysisClient, dataforseoBalance, emptyAeo, historyPoint, providerConfig, trackQuestions, type AeoWorkspace, type Brand } from '@seo/core';
import { autopilotSpentThisMonth } from './autopilot';
import { prisma } from './client';
import { getCompetitorWorkspace } from './competitors';
import { getKeywordWorkspace } from './keywords';
import { getSettings } from './settings';
import { getSiteDocument, saveSiteDocument } from './site-documents';

/**
 * Module 10.2 weekly tracking (worker job `weekly-ai-tracking`, Mondays 07:30 UTC): for every
 * customer website (trial or active, onboarding finished) with ticked questions, ask them again
 * in ChatGPT, Perplexity and Google AI Overviews and add a point to the share-of-voice trend.
 * Each run stays under the admin's monthly cap (ApiUsage endpoint "aeo"); sites run by hand
 * in the last 6 days are skipped.
 */
const PER_QUESTION_USD = 0.045;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

export async function runWeeklyAiTracking(now = new Date(), log?: (m: Record<string, unknown>) => void): Promise<{ ran: number; capped: boolean }> {
  const { env } = providerConfig();
  if (!env) return { ran: 0, capped: false };
  const settings = await getSettings();
  if (!settings['autopilot.enabled']) return { ran: 0, capped: false };
  const accounts = await prisma.customerAccount.findMany({
    where: { onboardingStep: { gte: 6 }, user: { active: true }, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: now } }] },
    select: { businessName: true, website: true, extraWebsites: true },
  });
  const gpt = createAnalysisClient(env.dataforseo);
  const ai = createAiClient(env.dataforseo);
  let ran = 0;
  for (const a of accounts) {
    for (const url of [...new Set([a.website, ...a.extraWebsites].filter((w): w is string => Boolean(w)))].slice(0, 3)) {
      const domain = hostOf(url);
      if (!domain) continue;
      const [kw, competitors, saved] = await Promise.all([getKeywordWorkspace(domain).catch(() => null), getCompetitorWorkspace(domain).catch(() => null), getSiteDocument<AeoWorkspace>('aeo', domain).catch(() => null)]);
      const questions = kw ? siteQuestions(kw, 10).questions : [];
      if (!questions.length || !competitors) continue;
      const ws = saved ?? emptyAeo(domain);
      const last = ws.history[ws.history.length - 1]?.date;
      if (last && now.getTime() - Date.parse(last) < 6 * 86_400_000) continue;
      if ((await autopilotSpentThisMonth(now)) + questions.length * PER_QUESTION_USD > settings['autopilot.monthlyCap']) return { ran, capped: true };
      const primary = Boolean(a.website && hostOf(a.website) === domain);
      const brands: Brand[] = [{ domain, name: primary ? a.businessName || null : null, you: true }, ...analysisTargets(competitors).map((c) => ({ domain: c.domain, name: c.name, you: false }))];
      const before = await dataforseoBalance(env.dataforseo);
      try {
        const t = await trackQuestions(questions, brands, { country: competitors.country, language: competitors.language }, COUNTRY_ISO[competitors.country], {
          chatGpt: (q, iso) => gpt.chatGpt(q, iso),
          perplexity: (q, iso) => ai.perplexity(q, iso),
          aiOverview: (q, l) => ai.aiOverview(q, l),
        });
        const after = before === null ? null : await dataforseoBalance(env.dataforseo);
        const charged = before !== null && after !== null ? Math.max(t.cost, Math.round((before - after) * 10_000) / 10_000) : t.cost;
        const next: AeoWorkspace = {
          ...ws,
          audit: ws.audit ? { ...ws.audit, answers: t.answers, share: t.share, sources: t.sources } : null,
          history: [...ws.history, historyPoint(t.share, now)].slice(-52),
        };
        await saveSiteDocument('aeo', domain, next);
        await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: 'aeo', units: questions.length * 3, costUsd: charged } }).catch(() => undefined);
        ran++;
        log?.({ domain, questions: questions.length, cost: charged });
      } catch (err) {
        log?.({ domain, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return { ran, capped: false };
}
