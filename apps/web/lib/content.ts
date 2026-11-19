import 'server-only';
import { createOpenAiClient, fetchPageContents, ga4LandingPages, gscSearchAnalytics, normDomain, runContentAudit, type ContentAudit } from '@seo/core';
import { getAnalysis } from './analysis';
import { customerAudits } from './customer-data';
import { ga4Access, getKeywordWorkspace, gscAccess, logUsage } from './keywords';
import { getMapping } from './mapping';
import { providerConfig } from './providers-config';
import { hit } from './rate-limit';
import { getDoc, saveDoc } from './site-docs';

/**
 * Module 7 · content audit (`SiteDocument` kind "content"). Free on DataForSEO: Search Console
 * (both 90-day windows), GA4 landing pages (customer connection), our own page fetches and OpenAI.
 */
const KIND = 'content';
export const getContent = (rawDomain: string) => getDoc<ContentAudit>(KIND, normDomain(rawDomain));

export async function runContent(rawDomain: string, by: 'team' | 'customer'): Promise<{ audit?: ContentAudit; problem?: 'too-often' }> {
  const domain = normDomain(rawDomain);
  if (by === 'customer' && !(await hit(`content-audit:${domain}`, 2, 24 * 60 * 60)).allowed) return { problem: 'too-often' };
  const [audits, keywords, mapping, analysis, gsc, ga4] = await Promise.all([customerAudits(`https://${domain}/`), getKeywordWorkspace(domain), getMapping(domain), getAnalysis(domain), gscAccess(domain), ga4Access(domain)]);
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const [gscNow, gscPrev, ga4Rows] = await Promise.all([
    gsc ? gscSearchAnalytics(gsc.token, gsc.property, { startDate: day(93), endDate: day(3), dimensions: ['page'], maxRows: 5000 }).catch(() => null) : null,
    gsc ? gscSearchAnalytics(gsc.token, gsc.property, { startDate: day(183), endDate: day(94), dimensions: ['page'], maxRows: 5000 }).catch(() => null) : null,
    ga4 ? ga4LandingPages(ga4.token, ga4.property, 90).catch(() => null) : null,
  ]);
  const report = audits.latest;
  const duplicates = (report?.issues ?? []).filter((i) => (i.ruleId === '1.6.6' || i.ruleId === '2.4.7') && i.status !== 'pass').flatMap((i) => i.urls);
  const openai = providerConfig().env?.openai;
  const audit = await runContentAudit(
    {
      domain,
      pages: report?.pages ?? [],
      sitemapOnly: mapping.sitemapOnly ?? [],
      gscNow: gscNow ? gscNow.flatMap((r) => (r.keys[0] ? [{ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }] : [])) : null,
      gscPrev: gscPrev ? gscPrev.flatMap((r) => (r.keys[0] ? [{ page: r.keys[0], clicks: r.clicks }] : [])) : null,
      ga4: ga4Rows,
      duplicates,
      keywords,
      mapping,
      analysis,
    },
    { pages: (urls) => fetchPageContents(urls), ai: openai ? createOpenAiClient(openai) : null, kind: keywords.businessType === 'shop' ? 'online shop' : 'local service business' },
  );
  await saveDoc(KIND, domain, audit);
  await logUsage('openai', audit.tokens);
  return { audit };
}
