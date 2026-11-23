import { KNOWN_CITIES } from '../audit/templates';
import { focusPass } from './focus';
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

/** Country names and the ways people write them, for "Another country". */
const COUNTRIES: string[][] = [
  ['united kingdom', 'uk', 'england', 'britain', 'great britain', 'scotland', 'wales'],
  ['united states', 'usa', 'us', 'america', 'american'],
  ['canada', 'canadian'], ['australia', 'australian'], ['new zealand', 'nz'], ['ireland', 'irish'], ['india', 'indian'], ['pakistan', 'pakistani'],
  ['united arab emirates', 'uae'], ['saudi arabia', 'ksa'], ['qatar'], ['south africa'], ['germany'], ['france'], ['singapore'], ['malaysia'], ['philippines'], ['nigeria'],
];

/** Why a keyword should go, or null to keep it. */
export function removalReason(term: string, ctx: { locations: string[]; brands: string[]; competitorStems: string[]; country?: string }): string | null {
  const t = normTerm(term);
  if (ctx.country) {
    const home = COUNTRIES.find((g) => g[0] === normTerm(ctx.country!));
    const other = COUNTRIES.find((g) => g !== home && g.some((n) => hasPhrase(t, n)) && !(home ?? []).some((n) => hasPhrase(t, n)));
    // "us" alone is too common a word; only the longer names count for the United States.
    if (other && !(other[0] === 'united states' && !['united states', 'usa', 'america', 'american'].some((n) => hasPhrase(t, n)))) return `Another country (${other[0]})`;
  }
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

/**
 * Words that mean the same trade, so "hvac near me" counts as being about "ac repair". A group
 * switches on only through its trigger words ("cooling bedding" must not pull in air conditioning).
 */
const SYNONYMS: { triggers: string[]; words: string[] }[] = [
  { triggers: ['ac', 'aircon', 'hvac', 'conditioning', 'conditioner'], words: ['ac', 'air', 'conditioning', 'conditioner', 'aircon', 'hvac', 'cooling', 'cool', 'cooler'] },
  { triggers: ['furnace', 'heating', 'heater', 'hvac', 'boiler'], words: ['furnace', 'heating', 'heat', 'heater', 'hvac', 'boiler', 'warm'] },
  { triggers: ['plumbing', 'plumber', 'drain'], words: ['plumbing', 'plumber', 'drain', 'pipe', 'leak', 'water'] },
  { triggers: ['duct', 'ductwork'], words: ['duct', 'ductwork', 'vent', 'air'] },
  { triggers: ['electrical', 'electrician'], words: ['electrical', 'electrician', 'wiring', 'electric'] },
  { triggers: ['roofing', 'roofer', 'roof'], words: ['roofing', 'roofer', 'roof'] },
];
/** Big shops and marketplaces: "bed linen dunelm" is someone looking for that shop, not for you. */
const RETAILERS = /\b(amazon|ebay|etsy|walmart|costco|ikea|argos|tesco|asda|sainsbury'?s?|morrisons|aldi|lidl|dunelm|john lewis|marks (and |& )?spencers?|m&s|primark|matalan|h&m|zara home|b&m|home bargains|wilko|debenhams|tk maxx|homesense|laura ashley|dorma|catherine lansfield|wayfair|home depot|lowe'?s|bed bath (and|&) beyond|kohl'?s|macy'?s|temu|aliexpress|shein|m and s|habitat|pottery barn|brooklyn bedding|the white company|cotton traders|at next|from next|next home|next (bed|bedding|duvet|curtains)\w*|^next$|next$)\b/;
export const GENERIC = new Set(['repair', 'service', 'company', 'best', 'cost', 'price', 'installation', 'install', 'replacement', 'emergency', 'local', 'contractor', 'me']);

/** The words that make a search about this business (services, brands, extra topics, plus synonyms). */
export function topicWords(seeds: { services: string[]; brands: string[]; extra: string[] }): Set<string> {
  const words = new Set(dedupeKey([...seeds.services, ...seeds.brands, ...seeds.extra].join(' ')).split(' ').filter((w) => w && !GENERIC.has(w)));
  for (const group of SYNONYMS) if (group.triggers.some((w) => words.has(w))) for (const w of group.words) words.add(w);
  return words;
}

/** Same word, or both in a synonym group the seed word switches on. */
export const sameWord = (seedWord: string, word: string) => seedWord === word || SYNONYMS.some((g) => g.triggers.includes(seedWord) && g.words.includes(word));

/** Every distinctive word of one service/topic/brand appears in the keyword ("egyptian cotton duvet cover" ⊇ "duvet covers"). */
export function coversSeed(term: string, seeds: { services: string[]; brands: string[]; extra: string[] }): boolean {
  const words = dedupeKey(term).split(' ');
  return [...seeds.services, ...seeds.extra, ...seeds.brands].some((phrase) => {
    const need = dedupeKey(phrase).split(' ').filter((w) => w && !GENERIC.has(w));
    return need.length > 0 && need.every((n) => words.some((w) => sameWord(n, w)));
  });
}

const TOOL_SOURCES = new Set(['ranked', 'competitor', 'suggestion']);
const toolOnly = (k: KeywordRecord) => k.sources.every((s) => TOOL_SOURCES.has(s));

/**
 * Keywords found by the tools (not typed in, not from Search Console) that are not about the
 * business. Competitors' lists are the noisiest (big sites rank for everything), so their
 * keywords must contain a whole service; the rest need one shared topic word.
 */
function offTopic(k: KeywordRecord, topic: Set<string>, seeds: { services: string[]; brands: string[]; extra: string[] }): boolean {
  if (!topic.size || !toolOnly(k)) return false;
  if (k.sources.every((s) => s === 'competitor')) return !coversSeed(k.term, seeds);
  return !dedupeKey(k.term).split(' ').some((w) => topic.has(w));
}

/** Words that say what a website is about: its page titles and H1s, without filler or brand-neutral words. */
export function siteVocabulary(texts: string[]): string[] {
  const words = new Map<string, number>();
  for (const t of texts) for (const w of new Set(dedupeKey(t).split(' '))) if (w.length > 2 && !GENERIC.has(w) && !STOP.has(w) && !/^\d+$/.test(w)) words.set(w, (words.get(w) ?? 0) + 1);
  return [...words.keys()].slice(0, 400);
}

/** Bumped when the cleaning rules change: lists cleaned with an older version are cleaned again (free). */
export const KEYWORD_QUALITY_VERSION = 4;

/** Difficulty from which a keyword counts as hard to rank for (0–100). */
export const HARD_KD = 60;
/** Hard keywords kept: at most this share of the kept list (never fewer than HARD_MIN). */
const HARD_SHARE = 0.1;
const HARD_MIN = 5;
/** Searches with no recorded volume kept: at most this share of the list (never fewer than ZERO_MIN). */
const ZERO_SHARE = 0.05;
const ZERO_MIN = 10;
/**
 * Never thinned out: kept or removed by hand, typed in, imported, from Search Console, or built from the
 * site's own research inputs (its services and places).
 */
const trusted = (k: KeywordRecord) => k.statusLocked || k.sources.some((s) => s === 'manual' || s === 'import' || s === 'gsc' || s === 'seed');

/**
 * The quality pass over the whole list (after the one-keyword rules):
 *  - relevance: a keyword the tools found must share a word with this website's research inputs and,
 *    once the site has been audited, with its own pages (or contain a whole service);
 *  - hard keywords (difficulty 60+) only where the site already ranks in the top 30, or the few most
 *    searched ones (10% of the list, at least 5): the rest wait until the site is stronger;
 *  - searches with no recorded volume only when they name a whole service, and only a few (5%, at least 10).
 */
export function qualityPass(list: KeywordRecord[], ws: Pick<KeywordWorkspace, 'seeds' | 'siteWords'>): KeywordRecord[] {
  const topic = topicWords(ws.seeds);
  const site = new Set(ws.siteWords ?? []);
  const words = (t: string) => dedupeKey(t).split(' ');
  const relevant = (k: KeywordRecord) => {
    if (coversSeed(k.term, ws.seeds)) return true;
    const w = words(k.term);
    const inputs = !topic.size || w.some((x) => topic.has(x));
    const pages = !site.size || w.some((x) => site.has(x));
    return inputs && pages;
  };
  const out = list.map((k) => (k.status !== 'kept' || trusted(k) || relevant(k) ? k : { ...k, status: 'removed' as const, removeReason: 'Not about this website', clusterId: null }));
  const kept = () => out.filter((k) => k.status === 'kept');

  const hardCap = Math.max(HARD_MIN, Math.floor(kept().length * HARD_SHARE));
  const hard = kept()
    .filter((k) => !trusted(k) && (k.difficulty ?? 0) >= HARD_KD && !(k.position !== null && k.position <= 30))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const tooHard = new Set(hard.slice(hardCap).map((k) => k.term));

  const zeroCap = Math.max(ZERO_MIN, Math.floor(kept().length * ZERO_SHARE));
  const zero = kept().filter((k) => !trusted(k) && !(k.volume && k.volume > 0) && k.position === null);
  const zeroKeep = new Set(zero.filter((k) => coversSeed(k.term, ws.seeds)).sort((a, b) => a.term.length - b.term.length).slice(0, zeroCap).map((k) => k.term));

  return out.map((k) =>
    tooHard.has(k.term)
      ? { ...k, status: 'removed' as const, removeReason: `Too hard to rank for now (difficulty ${k.difficulty})`, clusterId: null }
      : zero.includes(k) && !zeroKeep.has(k.term)
        ? { ...k, status: 'removed' as const, removeReason: 'Too few searches', clusterId: null }
        : k,
  );
}

/** Applies the rules, merges near-duplicates into the most searched spelling, then keeps the focus list (focus.ts). */
export function cleanKeywords(ws: KeywordWorkspace, competitorNames: string[] = []): KeywordWorkspace {
  const ctx = { locations: ws.seeds.locations, brands: ws.seeds.brands, competitorStems: brandStems(competitorNames), country: ws.country };
  const topic = topicWords(ws.seeds);
  const ownStem = ws.domain.split('.')[0]!.replace(/[^a-z0-9]/g, '');
  const ownBrandWords = ws.seeds.brands.map((b) => normTerm(b));
  // Phrases the user typed themselves: kept even with no recorded searches.
  const typed = new Set([...ws.seeds.services, ...ws.seeds.extra].map(normTerm));
  const ruled: KeywordRecord[] = ws.keywords.map((k) => {
    if (k.statusLocked) return k;
    const t = normTerm(k.term);
    const shop = !k.sources.some((s) => s === 'manual' || s === 'import' || s === 'gsc') && RETAILERS.test(t) && !ownBrandWords.some((b) => b && RETAILERS.test(b) && t.includes(b));
    const elsewhere = k.intent === 'navigational' && toolOnly(k) && !t.replace(/[^a-z0-9]/g, '').includes(ownStem);
    const generated = k.volume === 0 && k.sources.every((s) => s === 'seed') && !typed.has(t);
    const reason =
      removalReason(k.term, ctx) ??
      (shop || elsewhere ? 'Looking for another shop or site' : null) ??
      (offTopic(k, topic, ws.seeds) ? 'Not about your services' : null) ??
      (generated ? 'No one searches this' : null);
    return reason ? { ...k, status: 'removed', removeReason: reason, clusterId: null } : { ...k, status: 'kept', removeReason: null };
  });
  const checked = qualityPass(ruled, ws);
  const groups = new Map<string, KeywordRecord[]>();
  for (const k of checked) if (k.status === 'kept') groups.set(dedupeKey(k.term), [...(groups.get(dedupeKey(k.term)) ?? []), k]);
  // Google counts close variants as one search: the same volume and the same 12-month trend.
  for (const k of checked) if (k.status === 'kept' && (k.volume ?? 0) >= 100 && k.trend?.length) groups.set(`=${k.volume}|${k.trend.join(',')}`, [...(groups.get(`=${k.volume}|${k.trend.join(',')}`) ?? []), k]);
  const dupOf = new Map<string, string>();
  const preferred = (k: KeywordRecord) => (k.statusLocked ? 4 : 0) + (k.position !== null ? 2 : 0) + (k.sources.some((s) => s === 'seed' || s === 'gsc' || s === 'manual' || s === 'import') ? 1 : 0);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const live = list.filter((k) => !dupOf.has(k.term));
    if (live.length < 2) continue;
    const [best, ...rest] = [...live].sort((a, b) => preferred(b) - preferred(a) || (b.volume ?? -1) - (a.volume ?? -1) || a.term.length - b.term.length);
    for (const k of rest) if (!k.statusLocked) dupOf.set(k.term, best!.term);
  }
  const deduped: KeywordRecord[] = checked.map((k) => (dupOf.has(k.term) ? { ...k, status: 'removed', removeReason: `Same search as "${dupOf.get(k.term)}"`, clusterId: null } : k));
  return { ...ws, keywords: focusPass(deduped, ws) };
}
