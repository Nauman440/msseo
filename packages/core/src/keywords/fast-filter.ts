import { KNOWN_CITIES } from '../audit/templates';
import { brandStems, normTerm } from './clean';

/**
 * Fast keyword pipeline (2026-11-25, user spec "Rebuild the Keywords tab pipeline"): the business profile,
 * the seeds and the code pre-filter that runs before the one LLM call.
 */
export type FastBusinessType = 'ecommerce' | 'local' | 'b2b';
export type LivePage = { url: string; status: number; name: string };

export type FastProfile = {
  domain: string;
  name: string;
  businessType: FastBusinessType;
  /** Categories they sell (ecommerce) or services they offer (local, b2b). */
  categories: string[];
  brandsStocked: string[];
  ownBrands: string[];
  country: string;
  cities: string[];
  language: string;
  notOffered: string[];
  bannedClaims: string[];
  /** b2b: industries they serve. */
  industries: string[];
  /** From the latest crawl: every checked address with its status and page name. */
  livePages: LivePage[];
  /** Validated competitors (shortlisted), max 3. */
  competitors: string[];
  /** More competitor names (shortlist, map rivals): their brand names are never kept. */
  rivalNames?: string[];
};

export type FastSource = 'ideas' | 'ranked' | 'competitor' | 'gsc';
export type FastCandidate = {
  term: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  position: number | null;
  url: string | null;
  gscImpressions: number | null;
  sources: FastSource[];
  /** Near-identical searches folded into this one (plurals, word order, "uk"). */
  variants: string[];
};

export type RemovedReason = 'brand' | 'not_sold' | 'wrong_intent' | 'location' | 'claim' | 'irrelevant' | 'low_value' | 'language';
export type RemovedKeyword = { keyword: string; reason: RemovedReason; detail?: string; by: 'code' | 'ai' };

export const MAX_SEEDS = 15;
export const MAX_LLM_CANDIDATES = 250;
export const FAST_MIN_VOLUME = 10;

const COUNTRY_WORD: Record<string, string> = { 'United Kingdom': 'uk', 'United States': 'usa', Canada: 'canada', Australia: 'australia', Ireland: 'ireland', 'New Zealand': 'nz' };

/** Step 2: at most 15 seeds from the categories and the place. */
export function fastSeeds(p: Pick<FastProfile, 'businessType' | 'categories' | 'cities' | 'country' | 'industries'>): string[] {
  const cats = [...new Set(p.categories.map((c) => normTerm(c)).filter(Boolean))];
  const out: string[] = [];
  const cw = COUNTRY_WORD[p.country] ?? normTerm(p.country);
  if (p.businessType === 'ecommerce') {
    // Each category first, then with the country, then with buy/online, so the first seeds cover every category.
    for (const c of cats) out.push(c);
    for (const c of cats) out.push(`${c} ${cw}`);
    for (const c of cats) out.push(`buy ${c} online`);
  } else if (p.businessType === 'local') {
    const city = normTerm(p.cities[0] ?? '');
    for (const c of cats) out.push(city ? `${c} ${city}` : c);
    for (const c of cats) out.push(`${c} near me`);
    for (const c of cats) for (const extra of p.cities.slice(1, 3)) out.push(`${c} ${normTerm(extra)}`);
  } else {
    for (const c of cats) out.push(c);
    for (const c of cats) for (const i of p.industries.slice(0, 2)) out.push(`${c} for ${normTerm(i)}`);
  }
  return [...new Set(out.filter(Boolean))].slice(0, MAX_SEEDS);
}

/** Brand lists per niche: a search naming a brand the business does not stock is for someone else's product. */
const NICHE_BRANDS: { words: RegExp; brands: string[] }[] = [
  {
    words: /\b(dog|dogs|cat|cats|pet|pets|puppy|kitten|treats?|kibble)\b/,
    brands: [
      'whiskas', 'purina', 'royal canin', 'iams', 'applaws', 'go cat', 'felix', 'sheba', 'pedigree', 'bakers', 'butchers', 'lilys kitchen', "lily's kitchen", 'scrumbles',
      'harringtons', 'burns', 'pet munchies', 'pawlicious', 'jr pet', 'pets at home', 'hills', "hill's", 'acana', 'orijen', 'james wellbeloved', 'arden grange', 'forthglade',
      'naturediet', 'wainwrights', 'tails com', 'tails.com', 'butternut box', 'pooch and mutt', 'pooch & mutt', 'yumove', 'dreamies', 'denta stix', 'dentastix', 'kong', 'nylabone',
      'bob martin', 'zooplus', 'petplanet', 'monster pet', 'barking heads', 'meowing heads', 'canagan', 'pure pet food', 'chappie', 'winalot', 'markies', 'tesco', 'asda',
    ],
  },
  {
    words: /\b(ac|hvac|furnace|boiler|heat pump|air conditioning|heating)\b/,
    brands: ['carrier', 'trane', 'lennox', 'rheem', 'goodman', 'daikin', 'mitsubishi', 'bryant', 'american standard', 'ruud', 'amana', 'worcester bosch', 'vaillant', 'baxi', 'viessmann', 'british gas'],
  },
  {
    words: /\b(bed|bedding|duvet|pillow|sheets?|linen|mattress)\b/,
    brands: ['dunelm', 'ikea', 'john lewis', 'm&s', 'marks and spencer', 'emma mattress', 'simba', 'silentnight', 'dreams', 'the white company', 'soak and sleep', 'brooklinen', 'casper'],
  },
];
const hasPhrase = (t: string, p: string) => p.length > 0 && ` ${t} `.includes(` ${p} `);

/** The known brand (or competitor brand) a search names, if the business does not stock it or own it. */
export function foreignBrand(term: string, p: Pick<FastProfile, 'brandsStocked' | 'ownBrands' | 'competitors' | 'categories' | 'rivalNames'>): string | null {
  const t = normTerm(term);
  const ok = [...p.brandsStocked, ...p.ownBrands].map(normTerm).filter(Boolean);
  const okCompact = ok.map((b) => b.replace(/[^a-z0-9]/g, ''));
  const context = normTerm([...p.categories, term].join(' '));
  for (const n of NICHE_BRANDS) {
    if (!n.words.test(context)) continue;
    const hit = n.brands.map(normTerm).find((b) => hasPhrase(t, b) && !ok.some((o) => o === b || hasPhrase(o, b)));
    if (hit) return hit;
  }
  const compact = t.replace(/[^a-z0-9]/g, '');
  const rival = brandStems([...p.competitors, ...(p.rivalNames ?? [])]).find((s) => compact.includes(s) && !okCompact.some((b) => b && (s.includes(b) || b.includes(s))));
  return rival ?? null;
}

/** "Free" that describes the product or the offer ("grain free", "free delivery"), not someone wanting it for nothing. */
const FREE_OK = /\b(grain|gluten|sugar|dairy|wheat|cruelty|fragrance|chemical|additive|salt|fat|lactose|nut|soy|cereal|plastic|paraben|alcohol|caffeine|bpa|hassle|risk|interest|meat|chicken|beef|preservative|filler)[- ]free\b|\bfree (delivery|shipping|returns|uk delivery|next day delivery)\b/g;
const WRONG_INTENT = /\b(jobs?|careers?|salary|salaries|hiring|free|diy|recipes?|homemade|home made|wholesale|trade|template|pdf|meaning|definition)\b|\bhow to become\b/;
const COUNTRIES: string[][] = [
  ['united kingdom', 'uk', 'england', 'britain', 'scotland', 'wales'], ['united states', 'usa', 'america'], ['canada'], ['australia'], ['new zealand'], ['ireland'],
  ['india'], ['pakistan'], ['south africa'], ['germany'], ['france'], ['spain'], ['italy'], ['netherlands'], ['uae', 'dubai'], ['singapore'], ['nigeria'], ['philippines'],
];
const NON_LATIN = /[Ѐ-ӿ؀-ۿऀ-ॿ぀-ヿ一-鿿가-힯]/;

/** Step 4: why a candidate is removed before the LLM sees it (null = keep). */
export function prefilterReason(c: FastCandidate, p: FastProfile): { reason: RemovedReason; detail: string } | null {
  const t = normTerm(c.term);
  const brand = foreignBrand(c.term, p);
  if (brand) return { reason: 'brand', detail: brand };
  const wrong = WRONG_INTENT.exec(t.replace(FREE_OK, ' '));
  if (wrong) return { reason: 'wrong_intent', detail: wrong[0] };
  if (/\bnear me\b/.test(t) && p.businessType !== 'local') return { reason: 'location', detail: 'near me (not a local business)' };
  const served = p.cities.map(normTerm);
  const city = KNOWN_CITIES.find((k) => hasPhrase(t, k) && !served.some((s) => s === k || hasPhrase(s, k) || hasPhrase(k, s)));
  if (city) return { reason: 'location', detail: city };
  const home = COUNTRIES.find((g) => g.includes(normTerm(p.country)) || g[0] === normTerm(p.country));
  const other = COUNTRIES.find((g) => g !== home && g.some((n) => hasPhrase(t, n)));
  if (other) return { reason: 'location', detail: other[0]! };
  const claim = p.bannedClaims.map(normTerm).find((b) => b && hasPhrase(t, b));
  if (claim) return { reason: 'claim', detail: claim };
  const notSold = p.notOffered.map(normTerm).find((n) => n && hasPhrase(t, n));
  if (notSold) return { reason: 'not_sold', detail: notSold };
  if (p.language === 'en' && NON_LATIN.test(c.term)) return { reason: 'language', detail: 'another language' };
  if ((c.volume ?? 0) < FAST_MIN_VOLUME && !(c.gscImpressions && c.gscImpressions > 0)) return { reason: 'low_value', detail: `under ${FAST_MIN_VOLUME} searches a month` };
  return null;
}

/** Same search in another form: plurals, word order and a country suffix ("uk") do not count. */
export function variantKey(term: string): string {
  return [...new Set(normTerm(term).split(' ').filter((w) => w && !['uk', 'usa', 'the', 'a', 'for', 'of', 'in', 'and'].includes(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))].sort().join(' ');
}

/** Merges near-identical candidates: the most searched is the main one, the rest become its variants. */
export function dedupeCandidates(list: FastCandidate[]): FastCandidate[] {
  const groups = new Map<string, FastCandidate[]>();
  for (const c of list) groups.set(variantKey(c.term), [...(groups.get(variantKey(c.term)) ?? []), c]);
  return [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
    const main = sorted[0]!;
    const best = (f: (c: FastCandidate) => number | null, low = false) => g.map(f).filter((v): v is number => v !== null).sort((a, b) => (low ? a - b : b - a))[0] ?? null;
    return {
      ...main,
      position: best((c) => c.position, true),
      url: g.find((c) => c.position !== null && c.position === best((x) => x.position, true))?.url ?? main.url,
      gscImpressions: best((c) => c.gscImpressions),
      sources: [...new Set(g.flatMap((c) => c.sources))],
      variants: [...new Set([...main.variants, ...sorted.slice(1).flatMap((c) => [c.term, ...c.variants])])].filter((v) => v !== main.term),
    };
  });
}

/** Steps 4: filter, dedupe, keep the best 250 by volume × CPC. */
export function prefilter(list: FastCandidate[], p: FastProfile): { candidates: FastCandidate[]; removed: RemovedKeyword[] } {
  const removed: RemovedKeyword[] = [];
  const kept: FastCandidate[] = [];
  for (const c of list) {
    const r = prefilterReason(c, p);
    if (r) removed.push({ keyword: c.term, reason: r.reason, detail: r.detail, by: 'code' });
    else kept.push(c);
  }
  const value = (c: FastCandidate) => (c.volume ?? 0) * Math.max(0.2, c.cpc ?? 0.5) + (c.gscImpressions ?? 0);
  const ranked = dedupeCandidates(kept).sort((a, b) => value(b) - value(a));
  for (const c of ranked.slice(MAX_LLM_CANDIDATES)) removed.push({ keyword: c.term, reason: 'low_value', detail: `not in the best ${MAX_LLM_CANDIDATES}`, by: 'code' });
  return { candidates: ranked.slice(0, MAX_LLM_CANDIDATES), removed };
}

/** Claims a niche must never make when the business gave none: pet food and treats cannot promise to treat illness. */
export function defaultBannedClaims(categories: string[]): string[] {
  const text = normTerm(categories.join(' '));
  if (/\b(dog|cat|pet|puppy|kitten)s?\b/.test(text)) return ['cure', 'cures', 'anxiety', 'pills', 'medicine', 'medication', 'prescription', 'antibiotic'];
  return [];
}
