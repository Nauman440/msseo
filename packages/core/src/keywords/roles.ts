import { normTerm } from './clean';
import type { KeywordRecord, KeywordWorkspace } from './types';

/**
 * What each kept keyword is for (2026-11-25, user request: intent, supporting and informational keywords):
 *  - intent: the main buying search of a topic (its head keyword) or a service typed in the research
 *    inputs; one page is built or tuned around each;
 *  - supporting: the other buying searches of a topic (variants, places, brands), used in titles,
 *    headings and text of the same page;
 *  - informational: questions and research searches, answered in the text, FAQs and blog posts.
 */
export type KeywordRole = 'intent' | 'supporting' | 'informational';
export const KEYWORD_ROLES: KeywordRole[] = ['intent', 'supporting', 'informational'];

const QUESTION = /^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b|\b(vs|versus|guide|ideas|tips|meaning|difference|benefits?|explained)\b/;
export const isInformational = (term: string, intent?: string | null) => intent === 'informational' || QUESTION.test(normTerm(term));

export function keywordRoles(ws: Pick<KeywordWorkspace, 'keywords' | 'clusters' | 'seeds'>): Map<KeywordRecord, KeywordRole> {
  const heads = new Set(ws.clusters.map((c) => normTerm(c.head)));
  const typed = new Set(ws.seeds.services.map(normTerm));
  const out = new Map<KeywordRecord, KeywordRole>();
  for (const k of ws.keywords) {
    if (k.status !== 'kept') continue;
    const t = normTerm(k.term);
    out.set(k, isInformational(k.term, k.intent) ? 'informational' : heads.has(t) || typed.has(t) ? 'intent' : 'supporting');
  }
  return out;
}
