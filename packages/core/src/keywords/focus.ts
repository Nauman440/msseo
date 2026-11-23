import { KNOWN_CITIES } from '../audit/templates';
import { dedupeKey, GENERIC, normTerm, sameWord } from './clean';
import type { KeywordRecord, KeywordWorkspace } from './types';

/**
 * The focus pass: the last cleaning step. After the one-keyword rules and the quality pass the list
 * is "everything that could be about this business"; this step keeps only the keywords worth working
 * on, the way an SEO consultant would cut a raw export down to a target list:
 *
 *  1. Real demand: at least MIN_VOLUME searches a month (unless the site already shows for it).
 *  2. Close relevance: the keyword must carry at least half the words of one service (not just one
 *     shared word), so every keyword can be given to a page.
 *  3. Local reach: a local business does not target big searches without a place ("ac repair",
 *     368,000 a month nationwide); their local versions are kept instead.
 *  4. Opportunity score: demand (log of volume) × buying intent × chance to rank × local fit ×
 *     what advertisers pay × how closely it fits the service. Chance to rank compares difficulty
 *     with what THIS site can reach (`siteStrength`): a new site aims low, an established one higher;
 *     keywords far beyond its reach are removed for now.
 *  5. Focus: the best PER_SERVICE keywords per service (one page = one topic), research questions
 *     limited to a share of the list (blog material, not customers), and MAX_FOCUS in total.
 *
 * Small places: Google often reports 0–10 searches for "service + small town" although those searches
 * bring calls. Up to LOCAL_LOW_PER_SERVICE of them per service are kept when they are real phrasings
 * (Google autocomplete, or exactly "service place" from the research inputs).
 *
 * Never removed here: kept or removed by hand, typed in or imported, the exact services typed in the
 * research inputs, and searches the site already shows for (Search Console clicks, or a position in
 * the top 20). They count towards the limits first.
 */
export const MIN_VOLUME = 10;
export const PER_SERVICE = 20;
export const MAX_FOCUS = 150;
/** Research questions ("how long does an ac last"): at most this share of the list. */
const INFO_SHARE = 0.2;
const INFO_MIN = 5;
/** Searches without a place this big are national: out of reach for a local business. */
const BROAD_VOLUME = 1000;
/** Keywords that match no service (built from symptoms or other inputs) share one small bucket. */
const OTHER_CAP = 10;
const NO_TOPICS_CAP = 60;
/** Low-volume "service + your place" searches kept per service. */
export const LOCAL_LOW_PER_SERVICE = 5;
/** Removed as too hard when difficulty is this far above what the site can reach. */
const BEYOND_REACH = 20;

/**
 * How strong the site already is in Google, from its own rankings in the list (Labs and Search Console):
 * the difficulty it can realistically reach in the next few months.
 */
export type SiteStrength = { level: 'new' | 'growing' | 'established'; reach: number; ranked: number; top10: number };
export function siteStrength(list: KeywordRecord[]): SiteStrength {
  const own = list.filter((k) => k.position !== null && k.sources.some((s) => s === 'ranked' || s === 'gsc'));
  const ranked = own.filter((k) => k.position! <= 100).length;
  const top10 = own.filter((k) => k.position! <= 10).length;
  if (top10 >= 30 || ranked >= 150) return { level: 'established', reach: 60, ranked, top10 };
  if (top10 >= 5 || ranked >= 30) return { level: 'growing', reach: 45, ranked, top10 };
  return { level: 'new', reach: 30, ranked, top10 };
}

const hasPhrase = (term: string, phrase: string) => phrase.length > 0 && ` ${term} `.includes(` ${phrase} `);

/** Share (0–1) of a service's distinctive words that the keyword contains (synonyms count). */
function fit(term: string, phrase: string): number {
  const words = dedupeKey(term).split(' ');
  const need = dedupeKey(phrase).split(' ').filter((w) => w && !GENERIC.has(w));
  if (!need.length) return 0;
  return need.filter((n) => words.some((w) => sameWord(n, w))).length / need.length;
}

/** The service (or extra topic) a keyword belongs to, and how closely it fits. */
export function bestService(term: string, topics: string[]): { topic: string | null; fit: number } {
  let best: { topic: string | null; fit: number } = { topic: null, fit: 0 };
  for (const t of topics) {
    const f = fit(term, t);
    // Ties go to the service listed first (the main one).
    if (f > best.fit) best = { topic: t, fit: f };
  }
  return best;
}

/** "Dallas, TX" → ["dallas tx", "dallas"]: either spelling counts as naming the place. */
const placeNames = (locations: string[]) => locations.flatMap((l) => [normTerm(l), normTerm(l.split(',')[0] ?? '')]).filter(Boolean);

/**
 * A low-volume search worth keeping for a local business: it names one of the places served and is a
 * real phrasing (Google autocomplete), or is exactly "service place" / "service in place".
 */
export function localLowOk(k: Pick<KeywordRecord, 'term' | 'sources'>, seeds: { services: string[]; locations: string[] }): boolean {
  const t = normTerm(k.term);
  const places = placeNames(seeds.locations);
  if (!places.some((p) => hasPhrase(t, p))) return false;
  if (k.sources.includes('autocomplete')) return true;
  const services = seeds.services.map(normTerm).filter(Boolean);
  return services.some((sv) => places.some((p) => t === `${sv} ${p}` || t === `${sv} in ${p}`));
}

export function isLocalSearch(term: string, locations: string[]): boolean {
  const t = normTerm(term);
  return /\bnear me\b/.test(t) || placeNames(locations).some((p) => hasPhrase(t, p)) || KNOWN_CITIES.some((c) => hasPhrase(t, c));
}

const INTENT_WEIGHT: Record<string, number> = { transactional: 1, commercial: 0.9, informational: 0.45, navigational: 0.3 };

function winChance(k: KeywordRecord, reach: number): number {
  const r = k.difficulty === null ? null : k.difficulty / reach;
  const base = r === null ? 0.8 : r <= 0.5 ? 1.15 : r <= 0.8 ? 1 : r <= 1 ? 0.8 : r <= 1.3 ? 0.5 : 0.25;
  const p = k.position;
  // Already on page 1–2: the cheapest traffic there is (improve a page that Google already likes).
  const lift = p === null ? 1 : p <= 3 ? 1.1 : p <= 20 ? 1.6 : p <= 50 ? 1.25 : 1;
  return base * lift;
}

/** How much a keyword is worth working on (higher is better). */
export function opportunity(k: KeywordRecord, ctx: { local: boolean; locations: string[]; fit: number; reach?: number }): number {
  const demand = Math.log10((k.volume ?? 0) + 10);
  const intent = k.intent ? INTENT_WEIGHT[k.intent] ?? 0.7 : 0.7;
  const localFit = ctx.local && isLocalSearch(k.term, ctx.locations) ? 1.3 : 1;
  const money = (k.cpc ?? 0) >= 10 ? 1.25 : (k.cpc ?? 0) >= 3 ? 1.1 : 1;
  return demand * intent * winChance(k, ctx.reach ?? 45) * localFit * money * (0.5 + ctx.fit / 2);
}

const isTyped = (k: KeywordRecord, typed: Set<string>) => typed.has(normTerm(k.term));
const protectedKw = (k: KeywordRecord, typed: Set<string>) =>
  k.statusLocked ||
  k.sources.some((s) => s === 'manual' || s === 'import') ||
  isTyped(k, typed) ||
  (k.gscClicks ?? 0) > 0 ||
  (k.position !== null && k.position <= 20);

const remove = (k: KeywordRecord, reason: string): KeywordRecord => ({ ...k, status: 'removed', removeReason: reason, clusterId: null });

export function focusPass(list: KeywordRecord[], ws: Pick<KeywordWorkspace, 'seeds' | 'businessType'>): KeywordRecord[] {
  const topics = [...ws.seeds.services, ...ws.seeds.extra].map((t) => t.trim()).filter((t) => dedupeKey(t).split(' ').some((w) => w && !GENERIC.has(w)));
  const typed = new Set([...ws.seeds.services, ...ws.seeds.extra].map(normTerm));
  const locations = ws.seeds.locations;
  const local = ws.businessType !== 'shop' && locations.length > 0;
  const strength = siteStrength(list);
  const lowLocal = (k: KeywordRecord) => local && localLowOk(k, ws.seeds);

  // 1–3: hard rules, one keyword at a time.
  const ruled = list.map((k) => {
    if (k.status !== 'kept' || protectedKw(k, typed)) return k;
    const showsUp = k.position !== null && k.position <= 50;
    if (k.volume !== null && k.volume < MIN_VOLUME && !showsUp && !lowLocal(k)) return remove(k, `Too few searches (under ${MIN_VOLUME} a month)`);
    // Phrases built from the research inputs are on topic by construction; tool finds must fit a service.
    if (topics.length && !k.sources.includes('seed') && bestService(k.term, topics).fit < 0.5) return remove(k, 'Not closely about one of your services');
    if (local && (k.volume ?? 0) >= BROAD_VOLUME && k.intent !== 'informational' && !isLocalSearch(k.term, locations) && !showsUp) {
      return remove(k, 'Too broad for a local business (no place in the search)');
    }
    if (k.difficulty !== null && k.difficulty > strength.reach + BEYOND_REACH && !showsUp) {
      return remove(k, `Too hard for this site for now (difficulty ${k.difficulty}; it can reach about ${strength.reach})`);
    }
    return k;
  });

  // 4–5: score what is left and keep the best per service, few research questions, a total cap.
  const kept = ruled.filter((k) => k.status === 'kept');
  const scored = kept.map((k) => {
    const s = bestService(k.term, topics);
    const low = (k.volume ?? 0) < MIN_VOLUME && lowLocal(k);
    return { k, bucket: s.fit > 0 ? s.topic! : '', low, score: opportunity(k, { local, locations, fit: s.fit, reach: strength.reach }), safe: protectedKw(k, typed) };
  });
  const buckets = new Set(scored.map((x) => x.bucket));
  // Without any services in the research inputs there is nothing to split by: one list of the best NO_TOPICS_CAP.
  const cap = (b: string) => (b ? PER_SERVICE : topics.length ? OTHER_CAP : NO_TOPICS_CAP);
  const total = Math.min(MAX_FOCUS, [...buckets].reduce((s, b) => s + cap(b), 0));
  const infoCap = Math.max(INFO_MIN, Math.round(total * INFO_SHARE));
  const used = new Map<string, number>();
  const lowUsed = new Map<string, number>();
  let all = 0;
  let info = 0;
  const reason = new Map<KeywordRecord, string>();
  const take = (x: (typeof scored)[number]) => {
    used.set(x.bucket, (used.get(x.bucket) ?? 0) + 1);
    all++;
    if (x.k.intent === 'informational') info++;
    if (x.low) lowUsed.set(x.bucket, (lowUsed.get(x.bucket) ?? 0) + 1);
  };
  // Protected keywords take their places first.
  for (const x of scored) if (x.safe) take(x);
  for (const x of scored.filter((s) => !s.safe).sort((a, b) => b.score - a.score || (b.k.volume ?? 0) - (a.k.volume ?? 0))) {
    if ((used.get(x.bucket) ?? 0) >= cap(x.bucket)) reason.set(x.k, x.bucket ? `Not in the top ${PER_SERVICE} for "${x.bucket}"` : 'Lower priority than your service keywords');
    else if (all >= total) reason.set(x.k, `Not in your top ${total} keywords`);
    else if (x.low && (lowUsed.get(x.bucket) ?? 0) >= LOCAL_LOW_PER_SERVICE) reason.set(x.k, `Too few searches (under ${MIN_VOLUME} a month)`);
    else if (x.k.intent === 'informational' && info >= infoCap) reason.set(x.k, 'Research question: only the best few are kept for blog posts');
    else take(x);
  }
  return ruled.map((k) => (reason.has(k) ? remove(k, reason.get(k)!) : k));
}
