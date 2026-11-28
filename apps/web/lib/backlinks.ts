import 'server-only';
import {
  analysisTargets, BACKLINK_ESTIMATE_USD, brokenLinkedUrls, createBacklinksClient, dataforseoBalance, DfsAccessError, emptyBacklinks, normDomain, runBacklinkAudit,
  type BacklinkWorkspace,
} from '@seo/core';
import { accountSites, domainOf, listAccounts, siteProfile } from './accounts';
import { getWorkspace, saveWorkspace } from './competitors';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace } from './keywords';
import { getMapping } from './mapping';
import { providerConfig } from './providers-config';
import { getDoc, nextMonthlyRun, recordRun, saveDoc, underCap } from './site-docs';
import { siteUrl } from '@seo/core';

/** Module 8 · backlink audit + outreach list, one document per website (`SiteDocument` kind "backlinks"). */
const KIND = 'backlinks';
const TLD: Record<string, string> = { 'United Kingdom': '.uk', Canada: '.ca', Australia: '.au', 'New Zealand': '.nz', Ireland: '.ie', 'South Africa': '.za', Germany: '.de', India: '.in', Pakistan: '.pk', 'United Arab Emirates': '.ae' };

export async function getBacklinks(rawDomain: string): Promise<BacklinkWorkspace> {
  const domain = normDomain(rawDomain);
  return (await getDoc<BacklinkWorkspace>(KIND, domain)) ?? emptyBacklinks(domain);
}
export const saveBacklinks = (ws: BacklinkWorkspace) => saveDoc(KIND, ws.domain, ws);

/** Rule 1.5.7 (in-process audits): backlinked pages that are broken. */
export async function backlinkBrokenFromStore(url: string): Promise<string[]> {
  return brokenLinkedUrls((await getBacklinks(domainOf(url))).audit);
}

export type BacklinkProblem = 'not-configured' | 'not-enabled' | 'too-soon' | 'cap' | 'failed';

export async function runBacklinks(rawDomain: string, by: 'team' | 'customer'): Promise<{ ws?: BacklinkWorkspace; problem?: BacklinkProblem; next?: Date; message?: string }> {
  const domain = normDomain(rawDomain);
  const { env } = providerConfig();
  if (!env) return { problem: 'not-configured' };
  const [ws, competitors, keywords, mapping, audits, accounts] = await Promise.all([getBacklinks(domain), getWorkspace(domain), getKeywordWorkspace(domain), getMapping(domain), customerAudits(siteUrl(domain)), listAccounts()]);
  if (by === 'customer') {
    const next = nextMonthlyRun(ws.audit?.runAt);
    if (next) return { problem: 'too-soon', next };
    if (!(await underCap(BACKLINK_ESTIMATE_USD))) return { problem: 'cap' };
  }
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  const direct = analysisTargets(competitors).sort((a, b) => (a.shortlist === b.shortlist ? 0 : a.shortlist === 'direct' ? -1 : 1)).map((c) => c.domain);
  let calls = 0;
  const before = await dataforseoBalance(env.dataforseo);
  try {
    const audit = await runBacklinkAudit(
      {
        domain,
        competitors: direct,
        brand: siteProfile(account, domain).businessName,
        keywords: [...keywords.clusters.slice(0, 20).map((c) => c.head), ...keywords.seeds.services],
        places: keywords.seeds.locations,
        countryTld: TLD[competitors.country] ?? null,
        pages: [...(audits.latest?.pages ?? []).map((p) => p.url), ...(mapping.sitemapOnly ?? [])],
      },
      createBacklinksClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) }),
    );
    const after = before === null ? null : await dataforseoBalance(env.dataforseo);
    const charged = before !== null && after !== null ? Math.max(audit.costUsd, Math.round((before - after) * 10_000) / 10_000) : audit.costUsd;
    const next = { ...ws, audit: { ...audit, costUsd: charged } };
    await saveBacklinks(next);
    await recordRun('backlinks', by, calls, charged);
    // 3.8: linking domains of the shortlisted competitors.
    const counts = new Map(audit.competitors.map((c) => [c.domain, c.referringDomains]));
    if (counts.size) {
      await saveWorkspace({ ...competitors, competitors: competitors.competitors.map((c) => (counts.has(c.domain) ? { ...c, referringDomains: counts.get(c.domain) ?? null } : c)) }).catch(() => undefined);
    }
    return { ws: next };
  } catch (err) {
    if (err instanceof DfsAccessError) return { problem: 'not-enabled' };
    return { problem: 'failed', message: err instanceof Error ? err.message.slice(0, 160) : 'unknown error' };
  }
}
