import type { GscData } from './gsc-collect';
import type { PageContent } from './page-content';

/* Text signals shared by the content, trust and AI-readiness rules. */

const STOP = new Set(
  'a an and are as at be by for from how in is it of on or our the to us we what when where who why with your you best top near me page home index services service'.split(' '),
);

const tokens = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

/**
 * The page's main topic (spec 2.1.4, phase 1): the URL slug's meaningful words, or the
 * H1's for the homepage. Up to two words, e.g. "ac repair".
 */
export function mainTerm(c: PageContent): string[] {
  const path = new URL(c.url).pathname.split('/').filter(Boolean);
  const fromSlug = path.length ? tokens(decodeURIComponent(path[path.length - 1]!).replace(/[-_]+/g, ' ')) : [];
  return (fromSlug.length ? fromSlug : tokens(c.h1[0] ?? c.title ?? '')).slice(0, 2);
}

export const containsAll = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.length > 0 && words.every((w) => t.includes(w));
};

/** Occurrences of the term (all its words in sequence) per word of text, as a percentage. */
export function termDensity(text: string, term: string[]): { count: number; percent: number } {
  if (!term.length) return { count: 0, percent: 0 };
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  let count = 0;
  for (let i = 0; i + term.length <= words.length; i++) if (term.every((t, k) => words[i + k] === t)) count++;
  return { count, percent: words.length ? (count * term.length * 100) / words.length : 0 };
}

const syllables = (word: string) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  return Math.max(1, (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) ?? []).length);
};

/** Flesch reading ease and average sentence length (spec 2.4.8: < 50 or > 25 words is hard). */
export function readability(text: string): { flesch: number; avgSentence: number } | null {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\p{L}/u.test(s));
  const words = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
  if (words.length < 100 || sentences.length < 3) return null;
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const avgSentence = words.length / sentences.length;
  return { flesch: 206.835 - 1.015 * avgSentence - 84.6 * (syl / words.length), avgSentence };
}

export const GENERIC_ANCHOR = /^(click here|here|read more|learn more|more|more info|details|this|link|continue|go|see more|view more)$/i;
export const isGenericAnchor = (l: PageContent['links'][number]) => (l.text ? GENERIC_ANCHOR.test(l.text) : !l.imageAlt);

export const TRUST = /\blicen[cs]ed?\b|\binsured\b|\bwarrant(y|ies)\b|\bguarantee[ds]?\b|\bcertified\b|\baccredited\b|\bbonded\b|\bNATE\b|\bBBB\b|\bISO \d{4,5}\b/i;
export const CREDENTIALS = /\b(written|reviewed|checked) by\b|\babout the author\b|\bour (team|technicians?|engineers?|experts?)\b|\b\d+\+? years? (of )?experience\b|\bcertified\b|\blicen[cs]ed\b/i;
export const REVIEWS = /\breviews?\b|\btestimonials?\b|\bstars?\b|★|\brated\b|\bgoogle rating\b|\btrustpilot\b/i;
export const PRICE = /(?:[$£€₹]|\bRs\.?|\bPKR|\bAED|\bUSD)\s?\d|\b\d+\s?(?:USD|PKR|AED|EUR|GBP)\b|\bfrom \$?\d+|\bprice[sd]?\b|\bpricing\b/i;
export const SPAM = /\b(viagra|cialis|levitra|casino|online slots?|payday loans?|porn|xxx|replica watches|essay writing service|crypto bonus)\b/i;

/** Phone-like numbers (7+ digits), as digit strings. */
export const phonesIn = (text: string) => (text.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) ?? []).map((p) => p.replace(/\D/g, '')).filter((d) => d.length >= 7 && d.length <= 15);

/** String values of a schema field anywhere in the page's JSON-LD (e.g. "telephone"). */
export function schemaValues(c: PageContent, field: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (k === field && (typeof val === 'string' || typeof val === 'number')) out.push(String(val));
        // Lists of plain values (e.g. sameAs: ["https://facebook.com/…", …]).
        else if (k === field && Array.isArray(val) && val.every((x) => typeof x === 'string' || typeof x === 'number')) out.push(...val.map(String));
        else walk(val);
      }
    }
  };
  walk(c.jsonLd);
  return out;
}

export const hasSchema = (c: PageContent, ...types: string[]) => c.schemaTypes.some((t) => types.includes(t));

const normPage = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/**
 * Module 5 feeds Module 2: the primary keyword mapped to a page, when there is one; otherwise
 * mainTerm() from the URL/H1. Used by 2.3.2 and 2.4.3.
 */
export function keywordTerm(pageKeywords: Record<string, string> | undefined): (c: PageContent) => string[] {
  return (c) => {
    const kw = pageKeywords?.[normPage(c.url)];
    const t = kw ? tokens(kw).slice(0, 3) : [];
    return t.length ? t : mainTerm(c);
  };
}

/**
 * Main-term source for 2.1.4 / 2.2.4: the page's top Search Console query by clicks when
 * GSC data is present (spec §6.3), otherwise mainTerm() from the URL/H1.
 */
export function termResolver(gsc: GscData | undefined, pageKeywords?: Record<string, string>): { term: (c: PageContent) => string[]; source: 'mapping' | 'gsc' | 'url' } {
  const mapped = pageKeywords && Object.keys(pageKeywords).length ? pageKeywords : undefined;
  const fallback = keywordTerm(mapped);
  // A keyword chosen for the page (Module 5) wins; then the page's top Search Console query.
  const fromMap = (c: PageContent) => {
    const kw = mapped?.[normPage(c.url)];
    return kw ? tokens(kw).slice(0, 3) : [];
  };
  if (!gsc?.pageQueries.length) return { term: fallback, source: mapped ? 'mapping' : 'url' };
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const top = new Map<string, { query: string; clicks: number }>();
  for (const r of gsc.pageQueries) {
    const [page, query] = r.keys;
    if (!page || !query || r.clicks <= 0) continue;
    const key = norm(page);
    if ((top.get(key)?.clicks ?? 0) < r.clicks) top.set(key, { query, clicks: r.clicks });
  }
  return {
    term: (c) => {
      const m = fromMap(c);
      if (m.length) return m;
      const q = top.get(norm(c.url));
      const t = q ? tokens(q.query).slice(0, 3) : [];
      return t.length ? t : mainTerm(c);
    },
    source: mapped ? 'mapping' : 'gsc',
  };
}
