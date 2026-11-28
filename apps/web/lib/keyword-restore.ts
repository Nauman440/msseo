import 'server-only';
import { clusterKeywords, createKeywordClient, createLocalVolumeClient, dataforseoBalance, keywordInsightsEnabled, MAX_CLUSTER_SERPS, researchKeywords, type KeywordWorkspace } from '@seo/core';
import { prepare } from './auto';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace, gscQueries, logUsage, researchCompetitors, saveKeywordWorkspace } from './keywords';
import { providerConfig } from './providers-config';
import { siteUrl } from '@seo/core';

/** Fields the withdrawn fast keyword pipeline (2026-11-25) left on saved workspaces. */
type Leftovers = { fast?: unknown; fastCache?: unknown; fastAnswers?: unknown; fastError?: unknown };

/** True when the list was last written by the withdrawn fast pipeline (it cut lists down to a handful). */
export function fastLeftover(ws: KeywordWorkspace): boolean {
  return (ws as KeywordWorkspace & Leftovers).fast !== undefined;
}

function strip(ws: KeywordWorkspace): KeywordWorkspace {
  const { fast: _f, fastCache: _c, fastAnswers: _a, fastError: _e, ...rest } = ws as KeywordWorkspace & Leftovers;
  void _f; void _c; void _a; void _e;
  return rest;
}

/** Runs the normal keyword research once more, so the full list comes back. */
async function restore(domain: string): Promise<void> {
  const ws = strip(await getKeywordWorkspace(domain));
  const { env } = providerConfig();
  if (!env || !ws.seeds.services.length) {
    await saveKeywordWorkspace(ws);
    return;
  }
  let calls = 0;
  const before = await dataforseoBalance(env.dataforseo);
  const api = createKeywordClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) });
  const [competitors, gsc, audits] = await Promise.all([researchCompetitors(domain), gscQueries(domain), customerAudits(siteUrl(domain))]);
  const pageTitles = (audits.latest?.pages ?? []).flatMap((p) => [p.title ?? '', p.h1 ?? '']).filter(Boolean);
  const localVolume = keywordInsightsEnabled() ? createLocalVolumeClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) }) : null;
  const r = await researchKeywords(api, ws, { competitors: competitors.domains, competitorNames: competitors.names, gsc, pageTitles, localVolume });
  const kept = r.workspace.keywords.filter((k) => k.status === 'kept').length;
  const cl = kept ? await clusterKeywords(api, r.workspace, { maxSerps: MAX_CLUSTER_SERPS }) : null;
  await saveKeywordWorkspace(strip(cl?.workspace ?? r.workspace));
  const after = before === null ? null : await dataforseoBalance(env.dataforseo);
  const reported = r.cost + (cl?.cost ?? 0);
  await logUsage('dataforseo', calls, before !== null && after !== null ? Math.max(reported, Math.round((before - after) * 10_000) / 10_000) : reported);
}

/** Starts the restore in the background when the page is opened; true while it runs. */
export async function restoreKeywordsAfterFast(domain: string): Promise<boolean> {
  if (!fastLeftover(await getKeywordWorkspace(domain))) return false;
  return prepare(`keywords-restore:${domain}`, () => restore(domain), 6 * 60 * 60_000);
}
