import 'server-only';
import {
  AEO_ESTIMATE_USD, analysisTargets, COUNTRY_ISO, createAiClient, createAnalysisClient, createOpenAiClient, dataforseoBalance, emptyAeo, fetchPageContents, fetchRobotsTxt, historyPoint, normDomain, runAeoAudit,
  type AeoWorkspace, type Brand,
} from '@seo/core';
import { accountSites, domainOf, listAccounts, siteProfile } from './accounts';
import { getBacklinks } from './backlinks';
import { getWorkspace } from './competitors';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace, logUsage } from './keywords';
import { getLocal } from './local';
import { providerConfig } from './providers-config';
import { getDoc, nextMonthlyRun, recordRun, saveDoc, underCap } from './site-docs';

/** Module 10 · AI search audit + weekly tracking history (`SiteDocument` kind "aeo"). */
const KIND = 'aeo';
/** Customers can run it once a week (it also runs by itself every Monday). */
export const AEO_CUSTOMER_DAYS = 7;

export async function getAeo(rawDomain: string): Promise<AeoWorkspace> {
  const domain = normDomain(rawDomain);
  return (await getDoc<AeoWorkspace>(KIND, domain)) ?? emptyAeo(domain);
}


export async function runAeo(rawDomain: string, by: 'team' | 'customer'): Promise<{ ws?: AeoWorkspace; problem?: 'not-configured' | 'too-soon' | 'cap' | 'failed'; next?: Date; message?: string }> {
  const domain = normDomain(rawDomain);
  const { env } = providerConfig();
  if (!env) return { problem: 'not-configured' };
  const [ws, competitors, keywords, audits, local, backlinks, accounts] = await Promise.all([getAeo(domain), getWorkspace(domain), getKeywordWorkspace(domain), customerAudits(`https://${domain}/`), getLocal(domain), getBacklinks(domain), listAccounts()]);
  if (by === 'customer') {
    const next = nextMonthlyRun(ws.audit?.runAt, AEO_CUSTOMER_DAYS);
    if (next) return { problem: 'too-soon', next };
    if (!(await underCap(AEO_ESTIMATE_USD))) return { problem: 'cap' };
  }
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  const name = local?.profile?.title || siteProfile(account, domain).businessName;
  const brands: Brand[] = [{ domain, name, you: true }, ...analysisTargets(competitors).map((c) => ({ domain: c.domain, name: c.name, you: false }))];
  const questions = keywords.prompts.filter((p) => p.tracked !== false).map((p) => p.text);
  const locale = { country: competitors.country, language: competitors.language };
  let calls = 0;
  const log = (e: { provider: string }) => void (e.provider === 'dataforseo' && calls++);
  const gpt = createAnalysisClient({ ...env.dataforseo, log });
  const ai = createAiClient({ ...env.dataforseo, log });
  const before = await dataforseoBalance(env.dataforseo);
  try {
    const audit = await runAeoAudit(
      {
        domain,
        brands,
        questions,
        locale,
        iso: COUNTRY_ISO[competitors.country],
        facts: name ? { name, website: domain, phone: local?.profile?.phone ?? account?.phone ?? null, address: local?.profile?.address ?? null, services: keywords.seeds.services.slice(0, 10), places: keywords.seeds.locations.slice(0, 5), rating: local?.profile?.rating ?? null } : null,
        issues: audits.latest?.issues ?? null,
        pages: (audits.latest?.pages ?? []).map((p) => p.url),
        local,
        backlinks: backlinks.audit,
      },
      {
        chatGpt: (q, iso) => gpt.chatGpt(q, iso),
        perplexity: (q, iso) => ai.perplexity(q, iso),
        aiOverview: (q, l) => ai.aiOverview(q, l),
        robots: (d) => fetchRobotsTxt(d),
        pages: (urls) => fetchPageContents(urls),
        ai: env.openai ? createOpenAiClient(env.openai) : null,
      },
    );
    const after = before === null ? null : await dataforseoBalance(env.dataforseo);
    const charged = before !== null && after !== null ? Math.max(audit.costUsd, Math.round((before - after) * 10_000) / 10_000) : audit.costUsd;
    const next: AeoWorkspace = { ...ws, audit: { ...audit, costUsd: charged }, history: audit.answers.length ? [...ws.history, historyPoint(audit.share, new Date(audit.runAt))].slice(-52) : ws.history };
    await saveDoc(KIND, domain, next);
    await recordRun('aeo', by, calls, charged);
    await logUsage('openai', audit.tokens);
    return { ws: next };
  } catch (err) {
    return { problem: 'failed', message: err instanceof Error ? err.message.slice(0, 160) : 'unknown error' };
  }
}
