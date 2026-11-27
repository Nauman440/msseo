import { droppedFacts, metaProblems, titleProblems, type MetaContext } from '../actions/plan-meta';

/**
 * Quality gate for every drafted change (phase 3). A draft that fails goes back to the model once
 * with its problems; if it still fails, it is skipped and logged (never sent to the site).
 */
export type BusinessProfile = {
  name: string;
  /** Places served or named on the site (cities, regions, seas…): count as concrete facts. */
  places: string[];
  brands: string[];
  /** Services or products the business sells (research inputs): naming one is a concrete fact. */
  services?: string[];
  /** Words the owner never wants used. */
  bannedWords: string[];
  /** Competitors' names: never written on the client's site. */
  competitors: string[];
};

/** Medical, legal and guarantee claims are never written by the autopilot. */
const CLAIMS = /\b(guarantee[sd]?|guaranteed|risk[- ]free|100% (safe|secure|effective)|cures?|cured|heals?|treats? (?:anxiety|disease|pain)|prevents? disease|legal advice|lawyer[- ]approved|clinically proven|fda[- ]approved|best in the world|#1|number one)\b/i;
const HTML_ENTITY = /&(?:[a-z]+|#\d+);/i;

const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []);

/** Words or names from the owner's lists that appear in the text. */
function listed(text: string, list: string[]): string[] {
  const lower = ` ${text.toLowerCase()} `;
  return list.map((w) => w.trim()).filter((w) => w.length > 1 && new RegExp(`(^|[^\\p{L}\\p{N}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(lower));
}

/** Problems shared by every kind of text the autopilot writes. */
export function textProblems(text: string, profile: BusinessProfile): string[] {
  const p: string[] = [];
  if (HTML_ENTITY.test(text)) p.push('contains HTML entities');
  const claim = text.match(CLAIMS);
  if (claim) p.push(`makes a claim the autopilot never writes ("${claim[0]}")`);
  const banned = listed(text, profile.bannedWords);
  if (banned.length) p.push(`uses words the owner banned: ${banned.join(', ')}`);
  const rivals = listed(text, profile.competitors);
  if (rivals.length) p.push(`names a competitor: ${rivals.join(', ')}`);
  return p;
}

/**
 * A concrete fact for a service business: a number, a place it serves, a brand it stocks, a service
 * it sells, a concrete list of three or more things (services, steps), or a name of two or more
 * capitalised words that also appears on the page ("Gulf of Aden").
 */
export function hasFact(text: string, profile: BusinessProfile, pageText: string): boolean {
  if (/\d|%|[£$€]/.test(text)) return true;
  if (listed(text, [...profile.places, ...profile.brands, ...(profile.services ?? [])]).length) return true;
  if (/[\p{L}][^,.;:]{2,40},\s*[\p{L}][^,.;:]{2,40},\s*(?:and\s+)?[\p{L}][^,.;:]{2,40}/u.test(text)) return true;
  const names = text.match(/\b[A-Z][\p{L}’'-]+(?:\s+(?:of|and|&|the)?\s*[A-Z][\p{L}’'-]+)+/gu) ?? [];
  const page = pageText.toLowerCase();
  return names.some((n) => !n.toLowerCase().startsWith(profile.name.toLowerCase().split(' ')[0] ?? '') && page.includes(n.toLowerCase()));
}

export type TitleCheck = { mainKeyword: string | null; ctx: MetaContext; others: Set<string>; current: string | null; currentDescription: string | null; profile: BusinessProfile };

export function checkTitle(title: string, c: TitleCheck): string[] {
  const p = [...titleProblems(title, { mainKeyword: c.mainKeyword }, c.ctx, c.others), ...textProblems(title, c.profile)];
  if (c.current) {
    const lost = droppedFacts(`${c.current} ${c.currentDescription ?? ''}`, title + ' ' + (c.currentDescription ?? ''));
    if (lost.length) p.push(`drops a true fact from the current title: ${lost.join(', ')}`);
  }
  return p;
}

export type MetaCheck = { others: Set<string>; current: string | null; profile: BusinessProfile; pageText: string };

export function checkDescription(desc: string, c: MetaCheck): string[] {
  const base = metaProblems(desc, { others: c.others }).filter((x) => !x.startsWith('no concrete fact') || !hasFact(desc, c.profile, c.pageText));
  const p = [...base, ...textProblems(desc, c.profile)];
  if (c.current) {
    const lost = droppedFacts(c.current, desc);
    if (lost.length) p.push(`drops a true fact from the current description: ${lost.join(', ')}`);
  }
  return p;
}

/** Alt text: 5–15 words, describes the image, no "image of", no file names, no stuffing. */
export function checkAlt(alt: string, profile: BusinessProfile): string[] {
  const w = words(alt);
  const p: string[] = [];
  if (w.length < 5 || w.length > 15) p.push(`alt text has ${w.length} words (needs 5–15)`);
  if (/^(image|picture|photo|graphic) of\b/i.test(alt.trim())) p.push('starts with "image of"');
  if (/\.(jpe?g|png|webp|gif|svg)\b|[_]|\b(img|dsc)[-_ ]?\d+/i.test(alt)) p.push('looks like a file name');
  const counts = new Map<string, number>();
  for (const x of w.map((y) => y.toLowerCase()).filter((y) => y.length > 3)) counts.set(x, (counts.get(x) ?? 0) + 1);
  if ([...counts.values()].some((n) => n > 2)) p.push('repeats a word (keyword stuffing)');
  return [...p, ...textProblems(alt, profile)];
}

/**
 * Content blocks (direct answers, FAQ answers, short sections): only facts already on the site or in
 * the business profile. Every number in the block must appear in the source text.
 */
export function checkBlock(text: string, c: { kind: 'answer' | 'faq' | 'section' | 'table'; profile: BusinessProfile; sourceText: string }): string[] {
  const plain = text.replace(/<[^>]+>/g, ' ');
  const n = words(plain).length;
  const p: string[] = [];
  // 40–80 words: the same range as the audit's check 2.8.1.
  if (c.kind === 'answer' && (n < 40 || n > 80)) p.push(`direct answer has ${n} words (needs 40–80)`);
  if (c.kind === 'section' && (n < 60 || n > 220)) p.push(`section has ${n} words (needs 60–220)`);
  const source = `${c.sourceText} ${c.profile.places.join(' ')} ${c.profile.brands.join(' ')}`.toLowerCase();
  const numbers = plain.match(/\d[\d,.]*\s?%?/g) ?? [];
  const unknown = numbers.map((x) => x.trim().replace(/[.,]$/, '')).filter((x) => !source.includes(x.toLowerCase()));
  if (unknown.length) p.push(`uses numbers that are not on the site: ${[...new Set(unknown)].join(', ')}`);
  return [...p, ...textProblems(plain, c.profile)];
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with', 'near', 'me', 'best', 'top', 'uk', 'usa']);
/** Share of the keyword's meaningful words (plurals and case ignored) that appear in the text. */
export function keywordCoverage(text: string, keyword: string): number {
  const stem = (w: string) => w.toLowerCase().replace(/[’']s$/, '').replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, '');
  const have = new Set(words(text).map(stem));
  const want = [...new Set(words(keyword).map(stem))].filter((w) => !STOP.has(w));
  if (!want.length) return 1;
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Rules for a page's main heading (H1): says what the page is about in plain words. */
export function checkH1(h1: string, c: { mainKeyword: string | null; profile: BusinessProfile; title?: string | null }): string[] {
  const p: string[] = [];
  const t = h1.trim();
  if (t.length < 15) p.push('shorter than 15 characters');
  if (t.length > 70) p.push('longer than 70 characters');
  if (/[|]/.test(t)) p.push('has a "|" (that belongs in the title tag, not the heading)');
  // Words that are only part of the business name do not count ("SRM Risk Management FZCO" is a name, not a topic).
  const name = c.profile.name.trim();
  const rest = name ? t.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ') : t;
  if (c.mainKeyword) {
    const need = words(c.mainKeyword).filter((w) => !STOP.has(w.toLowerCase())).length <= 3 ? 1 : 0.75;
    if (keywordCoverage(rest, c.mainKeyword) < need) p.push(`does not say what the page is about (main keyword “${c.mainKeyword}”)`);
  }
  if (name && words(rest).filter((w) => !STOP.has(w.toLowerCase())).length <= 1) p.push('is only the business name');
  return [...p, ...textProblems(t, c.profile)];
}
