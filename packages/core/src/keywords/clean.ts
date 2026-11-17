import { KNOWN_CITIES } from '../audit/templates';
import type { KeywordRecord, KeywordWorkspace } from './types';

/**
 * 4.4 Cleaning rules. Removed keywords stay in the list with a reason (and can be put back by
 * hand); zero-volume keywords are kept: they are how real customers phrase things.
 */
const JOBS = /\b(jobs?|careers?|salary|salaries|hiring|apprentice(ship)?s?|resume|indeed|glassdoor|schools?|classes|courses?|training|certification course|wages?)\b/;
const FREE = /\bfree\b/;
const FREE_OK = /\bfree (estimates?|quotes?|inspections?|consultations?|diagnostics?|service call)\b/;
const DIY = /\b(diy|yourself|how to (fix|repair|install|replace|clean|reset|recharge)|youtube|reddit|manuals?|pdf|wiring diagram)\b/;
const VEHICLE = /\b(cars?|auto|automotive|vehicles?|trucks?|rv)\b/;
const STOP = new Set(['in', 'for', 'the', 'a', 'an', 'of', 'to', 'and', 'my', 'near']);

export const normTerm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}&' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Same search in another word order / plural ("ac repairs dallas" = "dallas ac repair"). */
export const dedupeKey = (t: string) =>
  normTerm(t)
    .split(' ')
    .filter((w) => !STOP.has(w))
    .map(singular)
    .filter((w, i, all) => all.indexOf(w) === i)
    .sort()
    .join(' ');

const hasPhrase = (term: string, phrase: string) => phrase.length > 0 && ` ${term} `.includes(` ${phrase} `);

/** Competitor brand words from their domains/names ("coolray.com" → "coolray"), 5+ letters. */
export function brandStems(names: string[]): string[] {
  return [...new Set(names.map((n) => n.toLowerCase().replace(/^www\./, '').split('.')[0]!.replace(/[^a-z0-9]/g, '')).filter((s) => s.length >= 5))];
}

/** Why a keyword should go, or null to keep it. */
export function removalReason(term: string, ctx: { locations: string[]; brands: string[]; competitorStems: string[] }): string | null {
  const t = normTerm(term);
  if (JOBS.test(t)) return 'Job or training search';
  if (FREE.test(t) && !FREE_OK.test(t)) return 'Looking for something free';
  if (DIY.test(t)) return 'Do-it-yourself search';
  if (VEHICLE.test(t) && !ctx.brands.some((b) => VEHICLE.test(normTerm(b)))) return 'Vehicle search';
  const own = ctx.locations.map(normTerm);
  if (own.length) {
    const other = KNOWN_CITIES.find((c) => hasPhrase(t, c) && !own.some((o) => o === c || hasPhrase(o, c) || hasPhrase(c, o)));
    if (other) return `Another location (${other})`;
  }
  const compact = t.replace(/[^a-z0-9]/g, '');
  const ownBrands = ctx.brands.map((b) => normTerm(b).replace(/[^a-z0-9]/g, ''));
  const rival = ctx.competitorStems.find((s) => compact.includes(s) && !ownBrands.some((b) => b && s.includes(b)));
  if (rival) return `Competitor brand (${rival})`;
  return null;
}

/** Words that mean the same trade, so "hvac near me" counts as being about "ac repair". */
const SYNONYMS = [
  ['ac', 'air', 'conditioning', 'conditioner', 'aircon', 'hvac', 'cooling', 'cool', 'cooler'],
  ['furnace', 'heating', 'heat', 'heater', 'hvac', 'boiler', 'warm'],
  ['plumbing', 'plumber', 'drain', 'pipe', 'leak', 'water'],
  ['duct', 'ductwork', 'vent', 'air'],
  ['electrical', 'electrician', 'wiring', 'electric'],
  ['roofing', 'roofer', 'roof'],
];
const GENERIC = new Set(['repair', 'service', 'company', 'best', 'cost', 'price', 'installation', 'install', 'replacement', 'emergency', 'local', 'contractor', 'me']);

/** The words that make a search about this business (services, brands, extra topics, plus synonyms). */
export function topicWords(seeds: { services: string[]; brands: string[]; extra: string[] }): Set<string> {
  const words = new Set(dedupeKey([...seeds.services, ...seeds.brands, ...seeds.extra].join(' ')).split(' ').filter((w) => w && !GENERIC.has(w)));
  for (const group of SYNONYMS) if (group.some((w) => words.has(w))) for (const w of group) words.add(w);
  return words;
}

/** Keywords found by the tools (not typed in, not from Search Console) that share no topic word. */
const offTopic = (k: KeywordRecord, topic: Set<string>) =>
  topic.size > 0 && k.sources.every((s) => s === 'ranked' || s === 'competitor' || s === 'suggestion') && !dedupeKey(k.term).split(' ').some((w) => topic.has(w));

/** Applies the rules, then merges near-duplicates into the most searched spelling. */
export function cleanKeywords(ws: KeywordWorkspace, competitorNames: string[] = []): KeywordWorkspace {
  const ctx = { locations: ws.seeds.locations, brands: ws.seeds.brands, competitorStems: brandStems(competitorNames) };
  const topic = topicWords(ws.seeds);
  const ruled: KeywordRecord[] = ws.keywords.map((k) => {
    if (k.statusLocked) return k;
    const reason = removalReason(k.term, ctx) ?? (offTopic(k, topic) ? 'Not about your services' : null);
    return reason ? { ...k, status: 'removed', removeReason: reason, clusterId: null } : { ...k, status: 'kept', removeReason: null };
  });
  const groups = new Map<string, KeywordRecord[]>();
  for (const k of ruled) if (k.status === 'kept') groups.set(dedupeKey(k.term), [...(groups.get(dedupeKey(k.term)) ?? []), k]);
  // Google counts close variants as one search: the same volume and the same 12-month trend.
  for (const k of ruled) if (k.status === 'kept' && (k.volume ?? 0) >= 100 && k.trend?.length) groups.set(`=${k.volume}|${k.trend.join(',')}`, [...(groups.get(`=${k.volume}|${k.trend.join(',')}`) ?? []), k]);
  const dupOf = new Map<string, string>();
  const preferred = (k: KeywordRecord) => (k.statusLocked ? 4 : 0) + (k.position !== null ? 2 : 0) + (k.sources.some((s) => s === 'seed' || s === 'gsc' || s === 'manual' || s === 'import') ? 1 : 0);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const live = list.filter((k) => !dupOf.has(k.term));
    if (live.length < 2) continue;
    const [best, ...rest] = [...live].sort((a, b) => preferred(b) - preferred(a) || (b.volume ?? -1) - (a.volume ?? -1) || a.term.length - b.term.length);
    for (const k of rest) if (!k.statusLocked) dupOf.set(k.term, best!.term);
  }
  return {
    ...ws,
    keywords: ruled.map((k) => (dupOf.has(k.term) ? { ...k, status: 'removed', removeReason: `Same search as "${dupOf.get(k.term)}"`, clusterId: null } : k)),
  };
}
