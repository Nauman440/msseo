import { normTerm } from '../keywords/clean';
import type { KeywordRecord } from '../keywords/types';
import type { ReportPage } from '../types';
import { normUrl, pathOf, topicKeywords, type MappingRow, type MappingWorkspace } from './mapping';

/**
 * The page plan as an owner reads it (2026-11-25, user report "too many duplicate pages"): one card per
 * page, never two cards for one page or for the same new page.
 *  - topics mapped to the same address share one card (the highest-priority topic gives the primary keyword);
 *  - a topic with no page of its own joins the card whose search it nearly repeats ("dog food uk" →
 *    "dog food"), or another new page with the same address or search, instead of asking for a new page;
 *  - cards start with the pages every site has (homepage, about, shop), then products, blog, the rest,
 *    and new pages last;
 *  - each card has one primary keyword, secondary keywords (buying searches) and informational
 *    keywords (questions and research searches), keeping only keywords about the page's topic.
 */
export type CardKeyword = { term: string; volume: number | null; position: number | null };
export type PageCard = {
  key: string;
  /** The topics on this card, highest priority first (the first gives the primary keyword). */
  rows: MappingRow[];
  url: string | null;
  /** Suggested address of a new page. */
  suggestedPath: string | null;
  primary: CardKeyword;
  secondary: CardKeyword[];
  informational: CardKeyword[];
};

const STOP = new Set(['a', 'an', 'and', 'the', 'for', 'in', 'of', 'to', 'on', 'with', 'near', 'me', 'my', 'best', 'top', 'buy', 'cheap', 'online', 'uk', 'usa', 'shop', 'store', 'sale']);
const words = (s: string) => [...new Set(normTerm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))];
/** Same words in another order or form ("dog foods" / "foods dog"): kept once. */
const LIGHT = new Set(['a', 'an', 'and', 'the', 'for', 'in', 'of', 'to', 'on', 'with']);
const variantKey = (s: string) => [...new Set(normTerm(s).split(' ').filter((w) => w && !LIGHT.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))].sort().join(' ');

/** Two searches that ask for the same page: one's words are (nearly) all in the other's. */
export function sameSearch(a: string, b: string): boolean {
  const x = words(a);
  const y = new Set(words(b));
  if (!x.length || !y.size) return false;
  const shared = x.filter((w) => y.has(w)).length;
  return shared / Math.min(x.length, y.size) >= 0.75;
}

const QUESTION = /^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b|\b(vs|versus|guide|ideas|tips|meaning|difference|benefits?)\b/;
export const isInformational = (term: string, intent?: string | null) => intent === 'informational' || QUESTION.test(normTerm(term));

/** Order of the pages every site has, then the rest (new pages always last). */
const RANK: [RegExp, number][] = [[/^\/?$/, 0], [/\/(about|about-us|our-story|who-we-are)\b/, 1], [/\/(shop|store|collections\/all|collections|products)\/?$/, 2], [/\/(collections?|categor(y|ies)|product-category)\//, 3], [/\/products?\//, 4], [/\/(services?)\//, 3], [/\/(contact|contact-us)\b/, 6], [/\/(blogs?|news|articles?|guides?)\//, 7]];
const TYPE_RANK: Record<string, number> = { home: 0, about: 1, category: 3, service: 3, location: 4, service_location: 4, contact: 6, blog_index: 7, blog_post: 7, legal: 9 };
function rankOf(url: string | null, pageType: string | null | undefined): number {
  if (!url) return 20;
  const path = pathOf(url).toLowerCase();
  const byPath = RANK.find(([re]) => re.test(path))?.[1];
  return Math.min(byPath ?? 8, pageType ? (TYPE_RANK[pageType] ?? 8) : 8);
}

/** `places`: the places served; they never make a keyword relevant on their own ("dallas" is not the topic). */
export function pageCards(ws: MappingWorkspace, keywords: KeywordRecord[], pages: Pick<ReportPage, 'url' | 'pageType'>[] = [], places: string[] = []): PageCard[] {
  const placeWords = new Set(places.flatMap((p) => words(p)));
  const topicWords = (t: string) => words(t).filter((w) => !placeWords.has(w));
  const typeOf = new Map(pages.map((p) => [normUrl(p.url), p.pageType]));
  const byTerm = new Map(keywords.map((k) => [normTerm(k.term), k]));
  const rows = [...ws.rows].sort((a, b) => b.priority - a.priority || b.volume - a.volume);
  const cards: { key: string; rows: MappingRow[]; url: string | null; suggestedPath: string | null }[] = [];

  // Existing pages first: one card per address.
  for (const r of rows.filter((x) => x.url)) {
    const key = normUrl(r.url!);
    const card = cards.find((c) => c.key === key);
    if (card) card.rows.push(r);
    else cards.push({ key, rows: [r], url: r.url, suggestedPath: null });
  }
  // A topic with no page joins the existing card it nearly repeats, else a new page with the same address or search.
  for (const r of rows.filter((x) => !x.url)) {
    const heads = (c: (typeof cards)[number]) => c.rows.map((x) => x.primaryKeyword);
    const into = cards.find((c) => c.url && heads(c).some((h) => sameSearch(r.primaryKeyword, h)))
      ?? cards.find((c) => !c.url && ((r.suggestedPath && c.suggestedPath === r.suggestedPath) || heads(c).some((h) => sameSearch(r.primaryKeyword, h))));
    if (into) into.rows.push(r);
    else cards.push({ key: `new:${r.clusterId}`, rows: [r], url: null, suggestedPath: r.suggestedPath ?? null });
  }

  const kw = (term: string): CardKeyword => {
    const k = byTerm.get(normTerm(term));
    return { term, volume: k?.volume ?? null, position: k?.position ?? null };
  };
  const out = cards.map((c): PageCard => {
    const main = c.rows[0]!;
    const heads = c.rows.map((r) => r.primaryKeyword);
    const headWords = heads.map(topicWords);
    // Relevant = shares at least half the words of one of the card's searches (one shared word is not enough).
    const relevant = (t: string) => {
      const w = new Set(topicWords(t));
      return headWords.some((h) => h.length > 0 && h.filter((x) => w.has(x)).length >= Math.ceil(h.length / 2));
    };
    const seen = new Set([variantKey(main.primaryKeyword)]);
    const secondary: CardKeyword[] = [];
    const informational: CardKeyword[] = [];
    const add = (term: string, first = false) => {
      const v = variantKey(term);
      if (!v || seen.has(v) || (!first && !relevant(term))) return;
      seen.add(v);
      const k = byTerm.get(normTerm(term));
      (isInformational(term, k?.intent) ? informational : secondary).push(kw(term));
    };
    // The other topics' main searches first, then every topic's keywords, most searched first.
    for (const h of heads.slice(1)) add(h, true);
    const members = c.rows.flatMap((r) => [...r.secondaryKeywords, ...topicKeywords(r.clusterId, r.primaryKeyword, keywords, ws).map((m) => m.term)]);
    const ordered = [...new Set(members)].sort((a, b) => (byTerm.get(normTerm(b))?.volume ?? -1) - (byTerm.get(normTerm(a))?.volume ?? -1));
    for (const t of ordered) add(t);
    return { key: c.key, rows: c.rows, url: c.url, suggestedPath: c.suggestedPath, primary: { ...kw(main.primaryKeyword), volume: byTerm.get(normTerm(main.primaryKeyword))?.volume ?? main.volume ?? null }, secondary, informational };
  });
  return out.sort((a, b) => rankOf(a.url, a.url ? typeOf.get(normUrl(a.url)) : null) - rankOf(b.url, b.url ? typeOf.get(normUrl(b.url)) : null) || b.rows[0]!.priority - a.rows[0]!.priority);
}
