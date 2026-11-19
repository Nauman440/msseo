import 'server-only';
import { completePending, createLocalClient, dataforseoBalance, fetchLivePage, LOCAL_ESTIMATE_USD, normDomain, runLocalAudit, type LocalAudit } from '@seo/core';
import { accountSites, domainOf, listAccounts } from './accounts';
import { getBacklinks } from './backlinks';
import { getWorkspace } from './competitors';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace } from './keywords';
import { providerConfig } from './providers-config';
import { getDoc, nextMonthlyRun, recordRun, saveDoc, underCap } from './site-docs';

/** Module 9 · local SEO audit, one document per website (`SiteDocument` kind "local"). */
const KIND = 'local';

/** The latest local audit; reviews and posts that were not ready during the run are read now. */
export async function getLocal(rawDomain: string): Promise<LocalAudit | null> {
  const domain = normDomain(rawDomain);
  const a = await getDoc<LocalAudit>(KIND, domain);
  if (!a || (!a.pending.reviews && !a.pending.updates)) return a;
  const { env } = providerConfig();
  if (!env) return a;
  const done = await completePending(a, createLocalClient(env.dataforseo)).catch(() => null);
  if (!done) return a;
  await saveDoc(KIND, domain, done);
  return done;
}

export type LocalProblem = 'not-configured' | 'too-soon' | 'cap' | 'failed';

export async function runLocal(rawDomain: string, by: 'team' | 'customer'): Promise<{ audit?: LocalAudit; problem?: LocalProblem; next?: Date; message?: string }> {
  const domain = normDomain(rawDomain);
  const { env } = providerConfig();
  if (!env) return { problem: 'not-configured' };
  const [previous, competitors, keywords, audits, backlinks, accounts] = await Promise.all([getDoc<LocalAudit>(KIND, domain), getWorkspace(domain), getKeywordWorkspace(domain), customerAudits(`https://${domain}/`), getBacklinks(domain), listAccounts()]);
  if (by === 'customer') {
    const next = nextMonthlyRun(previous?.runAt);
    if (next) return { problem: 'too-soon', next };
    if (!(await underCap(LOCAL_ESTIMATE_USD))) return { problem: 'cap' };
  }
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  // Grid searches: the core searches from Competitors, else the top keyword topics.
  const searches = (competitors.searches.length ? competitors.searches : keywords.clusters.slice(0, 3).map((c) => c.head)).slice(0, 3);
  let calls = 0;
  const before = await dataforseoBalance(env.dataforseo);
  try {
    const audit = await runLocalAudit(
      {
        domain,
        businessName: account?.businessName || null,
        locale: { country: competitors.country, language: competitors.language },
        searches,
        places: keywords.seeds.locations,
        issues: audits.latest?.issues ?? null,
        localLinkDomains: backlinks.audit ? backlinks.audit.domains.filter((d) => d.local).map((d) => d.domain) : null,
      },
      { client: createLocalClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) }), homepage: (url) => fetchLivePage(url) },
    );
    const after = before === null ? null : await dataforseoBalance(env.dataforseo);
    const charged = before !== null && after !== null ? Math.max(audit.costUsd, Math.round((before - after) * 10_000) / 10_000) : audit.costUsd;
    const saved = { ...audit, costUsd: charged };
    await saveDoc(KIND, domain, saved);
    await recordRun('local', by, calls, charged);
    return { audit: saved };
  } catch (err) {
    return { problem: 'failed', message: err instanceof Error ? err.message.slice(0, 160) : 'unknown error' };
  }
}
