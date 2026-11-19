import 'server-only';
import { createOpenAiClient, draftAltTexts, fetchPageContents, imagesMissingAlt, normDomain, type AltDraft } from '@seo/core';
import { customerAudits } from './customer-data';
import { getKeywordWorkspace, logUsage } from './keywords';
import { providerConfig } from './providers-config';
import { hit } from './rate-limit';
import { getDoc, saveDoc } from './site-docs';

/** Module 2 "Automate": alt-text drafts for images without alt (`SiteDocument` kind "alt-text"). */
const KIND = 'alt-text';
export type AltTextDoc = { domain: string; runAt: string; pagesChecked: number; missing: number; drafts: AltDraft[]; tokens: number };

export const getAltText = (rawDomain: string) => getDoc<AltTextDoc>(KIND, normDomain(rawDomain));

export async function runAltText(rawDomain: string, by: 'team' | 'customer'): Promise<{ doc?: AltTextDoc; problem?: 'too-often' | 'no-audit' }> {
  const domain = normDomain(rawDomain);
  if (by === 'customer' && !(await hit(`alt-text:${domain}`, 2, 24 * 60 * 60)).allowed) return { problem: 'too-often' };
  const [audits, kw] = await Promise.all([customerAudits(`https://${domain}/`), getKeywordWorkspace(domain)]);
  const urls = (audits.latest?.pages ?? []).map((p) => p.url).slice(0, 15);
  if (!urls.length) return { problem: 'no-audit' };
  const pages = await fetchPageContents(urls);
  const missing = imagesMissingAlt(pages);
  const openai = providerConfig().env?.openai;
  const r = await draftAltTexts(openai ? createOpenAiClient(openai) : null, missing, kw.businessType === 'shop' ? 'online shop' : 'local service business');
  const doc: AltTextDoc = { domain, runAt: new Date().toISOString(), pagesChecked: pages.length, missing: missing.length, drafts: r.drafts, tokens: r.tokens };
  await saveDoc(KIND, domain, doc);
  if (r.tokens) await logUsage('openai', r.tokens);
  return { doc };
}
