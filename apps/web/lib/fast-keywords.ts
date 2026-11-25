import 'server-only';
import { applyFastResult, createKeywordClient, createOpenAiClient, dataforseoBalance, fastProfileFrom, runFastKeywords, type FastResult } from '@seo/core';
import { httpStatuses } from '@seo/core/server';
import { prepare } from '@/lib/auto';
import { customerAudits } from '@/lib/customer-data';
import { getKeywordWorkspace, gscQueries, logUsage, researchCompetitors, saveKeywordWorkspace } from '@/lib/keywords';
import { providerConfig } from '@/lib/providers-config';

/**
 * One fast keyword run for a website (button, background preparation and the team's "fetch again").
 * A failure is saved on the workspace (`fastError`) so the Keywords page can say why nothing changed.
 */
export async function runFastFor(domain: string, force: boolean): Promise<FastResult> {
  const ws = await getKeywordWorkspace(domain);
  const { env } = providerConfig();
  try {
    if (!ws.seeds.services.length) throw new Error('No services or products in the research inputs yet.');
    if (!env) throw new Error('Keyword data is not set up on this server (DataForSEO keys missing).');
    let calls = 0;
    const before = await dataforseoBalance(env.dataforseo);
    const kw = createKeywordClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) });
    const [competitors, audits] = await Promise.all([researchCompetitors(domain), customerAudits(`https://${domain}/`)]);
    const profile = fastProfileFrom(ws, { report: audits.latest ?? null, competitors: competitors.domains, rivalNames: competitors.names });
    const { result, cache } = await runFastKeywords(
      profile,
      { kw, ai: env.openai ? createOpenAiClient(env.openai) : null, gsc: () => gscQueries(domain), checkStatus: (u) => httpStatuses(u) },
      { cache: ws.fastCache, force },
    );
    await saveKeywordWorkspace({ ...applyFastResult(ws, result, cache), fastError: undefined });
    if (calls) {
      const after = before === null ? null : await dataforseoBalance(env.dataforseo);
      const charged = before !== null && after !== null ? Math.max(result.costUsd, Math.round((before - after) * 10_000) / 10_000) : result.costUsd;
      await logUsage('dataforseo', calls, charged);
    }
    if (result.aiTokens) await logUsage('openai', result.aiTokens);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveKeywordWorkspace({ ...ws, fastError: { at: new Date().toISOString(), message } }).catch(() => undefined);
    throw err;
  }
}

/**
 * A website still showing a keyword list from before the fast pipeline gets one fast run in the
 * background the first time its Keywords or Page plan is opened (no click needed). True while it runs.
 * After a failure it waits 6 hours before trying again on its own.
 */
export async function autoFastKeywords(domain: string): Promise<boolean> {
  const ws = await getKeywordWorkspace(domain);
  if (ws.fast || !ws.seeds.services.length || !providerConfig().env) return false;
  return prepare(`fast-keywords:${domain}`, () => runFastFor(domain, false), 6 * 60 * 60_000);
}
