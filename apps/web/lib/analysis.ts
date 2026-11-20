import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ANALYSIS_ESTIMATE_USD, analysisDeps, analysisTargets, dataforseoBalance, normDomain, runCompetitorAnalysis, type CompetitorAnalysis } from '@seo/core';
import { accountSites, domainOf, listAccounts, siteProfile } from './accounts';
import { usingDatabase } from './audit-store';
import { getWorkspace } from './competitors';
import { getKeywordWorkspace, logUsage } from './keywords';
import { getMapping } from './mapping';
import { providerConfig } from './providers-config';
import { appSettings } from './settings';

/**
 * Module 6 analyses: Postgres when DATABASE_URL is set, a JSON file per site in DATA_DIR/analysis
 * otherwise. Access is the same as Modules 3–5 (`competitorAccess`).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'analysis');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);
/** Customers can run one analysis per website every 30 days. */
export const CUSTOMER_EVERY_DAYS = 30;

export async function getAnalysis(rawDomain: string): Promise<CompetitorAnalysis | null> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getCompetitorAnalysis } = await import('@seo/db');
    return getCompetitorAnalysis(domain).catch(() => null);
  }
  try {
    return JSON.parse(await readFile(file(domain), 'utf8')) as CompetitorAnalysis;
  } catch {
    return null;
  }
}

async function saveAnalysis(a: CompetitorAnalysis): Promise<void> {
  if (usingDatabase()) {
    const { saveCompetitorAnalysis } = await import('@seo/db');
    await saveCompetitorAnalysis(a);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(a.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(a));
  await rename(tmp, file(a.domain));
}

/** When a customer may run the next analysis (null = now). */
export function nextCustomerRun(last: CompetitorAnalysis | null, now = new Date()): Date | null {
  if (!last) return null;
  const next = new Date(Date.parse(last.runAt) + CUSTOMER_EVERY_DAYS * 86_400_000);
  return next.getTime() > now.getTime() ? next : null;
}

export type RunProblem = 'not-configured' | 'no-shortlist' | 'too-soon' | 'cap';

/**
 * Runs the analysis for one website. Customers: once every 30 days, and only while the month's
 * autopilot + customer-analysis spend stays under the admin cap. The real charge (DataForSEO
 * balance drop) is recorded in ApiUsage.
 */
export async function runAnalysis(rawDomain: string, by: 'team' | 'customer'): Promise<{ analysis?: CompetitorAnalysis; problem?: RunProblem; next?: Date }> {
  const domain = normDomain(rawDomain);
  const { env } = providerConfig();
  if (!env) return { problem: 'not-configured' };
  const [competitors, keywords, mapping, previous, accounts] = await Promise.all([getWorkspace(domain), getKeywordWorkspace(domain), getMapping(domain), getAnalysis(domain), listAccounts()]);
  if (!analysisTargets(competitors).length) return { problem: 'no-shortlist' };
  if (by === 'customer') {
    const next = nextCustomerRun(previous);
    if (next) return { problem: 'too-soon', next };
    if (usingDatabase()) {
      const { autopilotSpentThisMonth } = await import('@seo/db');
      const cap = (await appSettings())['autopilot.monthlyCap'];
      if ((await autopilotSpentThisMonth()) + ANALYSIS_ESTIMATE_USD > cap) return { problem: 'cap' };
    }
  }
  const before = await dataforseoBalance(env.dataforseo);
  let calls = 0;
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  const analysis = await runCompetitorAnalysis(
    { competitors, keywords, mapping, businessName: siteProfile(account, domain).businessName },
    analysisDeps(env, { country: competitors.country, language: competitors.language }, (e) => void (e.provider === 'dataforseo' && calls++)),
  );
  const after = before === null ? null : await dataforseoBalance(env.dataforseo);
  const charged = before !== null && after !== null ? Math.max(analysis.costUsd, Math.round((before - after) * 10_000) / 10_000) : analysis.costUsd;
  const saved = { ...analysis, costUsd: charged };
  await saveAnalysis(saved);
  if (usingDatabase()) {
    const { prisma } = await import('@seo/db');
    // Customer runs count toward the monthly cap (endpoint "competitor-analysis"); team runs do not.
    await prisma.apiUsage
      .create({ data: { provider: 'dataforseo', endpoint: by === 'customer' ? 'competitor-analysis' : 'competitor-analysis-team', units: calls, costUsd: charged } })
      .catch(() => undefined);
  }
  await logUsage('openai', analysis.tokens);
  return { analysis: saved };
}
