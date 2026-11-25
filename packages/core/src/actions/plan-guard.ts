import { dedupeKey, GENERIC } from '../keywords/clean';
import type { KeywordWorkspace } from '../keywords/types';

/**
 * Bug fix 2026-11-25 (data leak): maxbox.uk's plan held AI questions written for another website (an agency).
 * Every workspace is keyed by its domain, so a plan must only ever be built from inputs of that one domain
 * (`assertSameSite`), and AI questions must be about this website's own topics (`relevantQuestions`):
 * questions written from another site's answers and kept in this site's workspace are left out.
 */
export class PlanInputMismatchError extends Error {
  constructor(readonly domain: string, readonly mismatches: { label: string; domain: string }[]) {
    super(`Plan for ${domain} refused: ${mismatches.map((m) => `${m.label} belongs to ${m.domain}`).join('; ')}`);
    this.name = 'PlanInputMismatchError';
  }
}

const bare = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

/** Refuses (and logs) when any input that names a website names a different one. */
export function assertSameSite(domain: string, inputs: { label: string; domain: string | null | undefined }[]): void {
  const want = bare(domain);
  const mismatches = inputs.filter((i) => i.domain && bare(i.domain) !== want).map((i) => ({ label: i.label, domain: bare(i.domain!) }));
  if (!mismatches.length) return;
  const err = new PlanInputMismatchError(want, mismatches);
  console.error(JSON.stringify({ level: 'error', msg: 'plan input from another website', domain: want, mismatches }));
  throw err;
}

/** Words every kind of business uses in questions; they say nothing about what this website sells. */
const QUESTION_GENERIC = new Set([
  ...GENERIC, 'who', 'what', 'which', 'where', 'when', 'why', 'how', 'can', 'could', 'should', 'does', 'do', 'is', 'are', 'i', 'me', 'my', 'our', 'your', 'you', 'we',
  'top', 'good', 'great', 'cheap', 'cheapest', 'affordable', 'online', 'buy', 'shop', 'store', 'help', 'need', 'find', 'recommend', 'recommended', 'review', 'reviews',
  'compare', 'vs', 'versus', 'near', 'nearby', 'area', 'uk', 'us', 'usa', 'today', 'quality', 'reliable', 'trusted', 'professional', 'professionals', 'option', 'options',
  'business', 'businesses', 'website', 'websites', 'google', 'service', 'services', 'provider', 'providers', 'agency', 'agencies', 'expert', 'experts', 'about', 'with', 'from', 'that', 'this', 'there', 'their', 'they', 'them', 'any', 'get', 'work', 'way', 'best',
].map((w) => dedupeKey(w)).filter(Boolean));

/** What this website is about: its services, brands, extra topics, kept keywords, topics and page words (not places). */
export function siteTopicWords(kw: Pick<KeywordWorkspace, 'seeds' | 'keywords' | 'clusters' | 'siteWords'>): Set<string> {
  const places = new Set(kw.seeds.locations.flatMap((l) => dedupeKey(l).split(' ')));
  const texts = [
    ...kw.seeds.services, ...kw.seeds.brands, ...kw.seeds.extra,
    ...kw.keywords.filter((k) => k.status === 'kept').map((k) => k.term),
    ...kw.clusters.map((c) => c.name), ...(kw.siteWords ?? []),
  ];
  const words = new Set<string>();
  for (const t of texts) for (const w of dedupeKey(t).split(' ')) if (w.length > 2 && !QUESTION_GENERIC.has(w) && !places.has(w) && !/^\d+$/.test(w)) words.add(w);
  return words;
}

/** Keeps the questions that share at least one topic word with this website; with no topic words, keeps all. */
export function relevantQuestions(questions: string[], topic: Set<string>): { kept: string[]; dropped: string[] } {
  if (!topic.size) return { kept: questions, dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const q of questions) (dedupeKey(q).split(' ').some((w) => topic.has(w)) ? kept : dropped).push(q);
  return { kept, dropped };
}

/**
 * The tracked AI questions of this website that are about it. A question someone typed or edited by hand
 * is always kept; generated ones must share a topic word with the site (see `relevantQuestions`).
 */
export function siteQuestions(kw: Pick<KeywordWorkspace, 'seeds' | 'keywords' | 'clusters' | 'siteWords' | 'prompts'>, limit = 30): { questions: string[]; dropped: string[] } {
  const topic = siteTopicWords(kw);
  const tracked = kw.prompts.filter((p) => p.tracked !== false);
  const { dropped } = relevantQuestions(tracked.filter((p) => !p.custom).map((p) => p.text), topic);
  const out = new Set(dropped);
  return { questions: tracked.filter((p) => p.custom || !out.has(p.text)).map((p) => p.text).slice(0, limit), dropped };
}

/** A short key of the research inputs (services, places, brands, business type). */
export const seedsKey = (kw: Pick<KeywordWorkspace, 'seeds' | 'businessType'>) =>
  [kw.businessType ?? 'services', ...[kw.seeds.services, kw.seeds.locations, kw.seeds.brands].map((l) => l.map((x) => dedupeKey(x)).sort().join(','))].join('|');
