import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import { normTerm } from './clean';
import { foreignBrand, prefilterReason, variantKey, type FastCandidate, type FastProfile, type LivePage, type RemovedKeyword, type RemovedReason } from './fast-filter';

/**
 * Fast keyword pipeline, steps 5–6: the one LLM call (the user's prompt, word for word) and the code
 * post-checks that make its answer safe to show: no brands or banned words, one topic per keyword,
 * one live (200) page per topic, redirects for ranking pages that are gone, at most 80 keywords in 25 topics.
 */
export type FastIntent = 'buy' | 'compare' | 'local' | 'learn';
export type FastRole = 'main' | 'supporting' | 'question';
export type FastOpportunity = 'quick_win' | 'new_page' | 'article' | 'optimise' | 'top';
export type FastKeyword = { keyword: string; volume: number | null; role: FastRole; position: number | null; difficulty: number | null; cpc: number | null; variants: string[] };
export type FastTopic = {
  id: string;
  topic: string;
  mainKeyword: string;
  intent: FastIntent;
  /** null = a page to create. */
  pageUrl: string | null;
  pageName: string;
  isNew: boolean;
  keywords: FastKeyword[];
  volume: number;
  position: number | null;
  opportunity: FastOpportunity;
};
export type AskClient = { keyword: string; question: string };

const INTENTS = ['buy', 'compare', 'local', 'learn'] as const;
const ROLES = ['main', 'supporting', 'question'] as const;
const REASONS = ['brand', 'not_sold', 'wrong_intent', 'location', 'claim', 'irrelevant', 'low_value'] as const;

export const fastAnswerZ = z.object({
  topics: z.array(z.object({
    topic: z.string(), main_keyword: z.string(), intent: z.enum(INTENTS), page_url: z.string(), page_name: z.string(), is_new_page: z.boolean(),
    keywords: z.array(z.object({ keyword: z.string(), volume: z.number(), role: z.enum(ROLES) })),
  })),
  removed: z.array(z.object({ keyword: z.string(), reason: z.enum(REASONS) })),
  ask_client: z.array(z.object({ keyword: z.string(), question: z.string() })),
});
export type FastAnswer = z.infer<typeof fastAnswerZ>;

const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const FAST_ANSWER_SCHEMA = obj({
  topics: { type: 'array', items: obj({
    topic: { type: 'string' }, main_keyword: { type: 'string' }, intent: { type: 'string', enum: INTENTS }, page_url: { type: 'string' }, page_name: { type: 'string' }, is_new_page: { type: 'boolean' },
    keywords: { type: 'array', items: obj({ keyword: { type: 'string' }, volume: { type: 'number' }, role: { type: 'string', enum: ROLES } }) },
  }) },
  removed: { type: 'array', items: obj({ keyword: { type: 'string' }, reason: { type: 'string', enum: REASONS } }) },
  ask_client: { type: 'array', items: obj({ keyword: { type: 'string' }, question: { type: 'string' } }) },
});

const TYPE_LABEL = { ecommerce: 'online shop', local: 'local service business', b2b: 'B2B business' } as const;
const none = (l: string[]) => (l.length ? l.join(', ') : 'none given');

/** The user's prompt with its variables filled (spec 2026-11-25). */
export function fastPrompt(p: FastProfile, candidates: FastCandidate[]): string {
  const where = [p.country, ...p.cities].filter(Boolean).join(', ');
  const pages = p.livePages.filter((x) => x.status === 200).slice(0, 150).map((x) => `${x.name} | ${x.url}`).join('\n') || 'none';
  const rows = candidates.map((c) => `${c.term} | ${c.volume ?? 0} | ${c.difficulty ?? '-'} | ${c.cpc === null ? '-' : c.cpc.toFixed(2)} | ${c.position ?? '-'} | ${c.url ?? '-'}`).join('\n');
  return `You are an SEO keyword analyst. Choose only the keywords that can bring paying customers to this
business, group them into topics and map each topic to one live page.

Business: ${p.name} (${p.domain}) — ${TYPE_LABEL[p.businessType]} in ${where}
Sells: ${none(p.categories)} | Brands stocked: ${none([...p.brandsStocked, ...p.ownBrands])} | Does NOT sell: ${none(p.notOffered)}
Never use: ${none(p.bannedClaims)}
Live pages (name | URL): ${pages}

Candidates (keyword | volume | difficulty | CPC | position | ranking URL):
${rows}

Rules:
1. KEEP only keywords where the searcher wants to buy, hire, compare options or find this kind of
   product/service — and this business actually sells it. When unsure, remove it.
2. REMOVE: competitor or unstocked brands, things they don't sell or sizes/formats they don't offer,
   jobs, free, DIY, wholesale, other places, medical or unsafe claims, and vague searches that are
   not clearly about what they sell (e.g. "pet camera", "treats jar").
3. Mark "ask_client" only for terms that may be the client's own or a similar brand.
4. Intent per kept keyword: buy | compare | local | learn. Keep "learn" only if it is a question
   a buyer asks before purchasing; it maps to an article or FAQ, not a product page.
5. Group synonyms and close variants into ONE topic (e.g. calm/calming dog treats; all subscription
   box variants). Main keyword = highest volume buy/compare keyword in the topic.
6. Map each topic to ONE live page from the list by name. If none fits, set page to "new" only if the
   topic is a real category they sell with at least 100 searches/month; otherwise drop it.
7. Never name a topic after a brand. Never map a topic to a URL not in the live list.

Return only JSON:
{"topics":[{"topic":"","main_keyword":"","intent":"","page_url":"","page_name":"","is_new_page":false,
  "keywords":[{"keyword":"","volume":0,"role":"main|supporting|question"}]}],
 "removed":[{"keyword":"","reason":"brand|not_sold|wrong_intent|location|claim|irrelevant|low_value"}],
 "ask_client":[{"keyword":"","question":""}]}`;
}

export const FAST_SPLIT = 125;
export const FAST_MAX_TOKENS = 6000;

/** Step 5: one call (two in parallel when there are more than 125 candidates), merged. */
export async function askFast(client: OpenAiClient, p: FastProfile, candidates: FastCandidate[], timeoutMs: number): Promise<{ answer: FastAnswer; tokens: number; model: string; calls: number }> {
  // Two halves that each see a fair share of the best candidates (alternating by rank).
  const parts = candidates.length > FAST_SPLIT ? [candidates.filter((_, i) => i % 2 === 0), candidates.filter((_, i) => i % 2 === 1)] : [candidates];
  const ask = (part: FastCandidate[]) =>
    client.generateJson<FastAnswer>({ name: 'keyword_topics', system: 'Return only JSON that matches the schema.', user: fastPrompt(p, part), jsonSchema: FAST_ANSWER_SCHEMA, parse: fastAnswerZ, maxOutputTokens: FAST_MAX_TOKENS * 2, timeoutMs });
  const answers = await Promise.all(parts.map(ask));
  const topics = new Map<string, FastAnswer['topics'][number]>();
  for (const t of answers.flatMap((a) => a.data.topics)) {
    const key = variantKey(t.topic);
    const have = topics.get(key);
    if (have) have.keywords.push(...t.keywords);
    else topics.set(key, { ...t, keywords: [...t.keywords] });
  }
  return {
    answer: { topics: [...topics.values()], removed: answers.flatMap((a) => a.data.removed), ask_client: answers.flatMap((a) => a.data.ask_client) },
    tokens: answers.reduce((s, a) => s + a.tokens, 0),
    model: answers[0]?.model ?? '',
    calls: answers.length,
  };
}

// ---- Step 6: code post-checks --------------------------------------------------------------------

export const FAST_MAX_TOPICS = 25;
export const FAST_MAX_KEYWORDS = 80;
export const NEW_PAGE_MIN_VOLUME = 100;
const WEIGHT: Record<FastIntent, number> = { buy: 1, local: 1, compare: 0.9, learn: 0.4 };

const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const words = (s: string) => new Set(variantKey(s).split(' ').filter((w) => w.length > 2));
/** Live pages whose name (or address) covers at least half the topic's words, best first. */
function matchPages(text: string, live: LivePage[]): LivePage[] {
  const want = words(text);
  if (!want.size) return [];
  return live
    .map((p) => {
      const have = words(`${p.name} ${p.url.replace(/[-_/.]+/g, ' ')}`);
      return { p, score: [...want].filter((w) => have.has(w)).length / want.size };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.p.url.length - b.p.url.length)
    .map((x) => x.p);
}
const matchPage = (text: string, live: LivePage[]) => matchPages(text, live)[0] ?? null;
const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export type PostResult = { topics: FastTopic[]; removed: RemovedKeyword[]; askClient: AskClient[]; redirects: { from: string; to: string }[]; notes: string[] };

export function postCheck(answer: FastAnswer, candidates: FastCandidate[], p: FastProfile, statuses: Record<string, number> = {}): PostResult {
  const byTerm = new Map<string, FastCandidate>();
  for (const c of candidates) for (const t of [c.term, ...c.variants]) byTerm.set(normTerm(t), c);
  const live = p.livePages.filter((x) => x.status === 200);
  const liveBy = new Map(live.map((x) => [normUrl(x.url), x]));
  const statusOf = (u: string) => p.livePages.find((x) => normUrl(x.url) === normUrl(u))?.status ?? statuses[normUrl(u)] ?? null;
  const removed: RemovedKeyword[] = answer.removed.map((r) => ({ keyword: r.keyword, reason: r.reason as RemovedReason, by: 'ai' as const }));
  const notes: string[] = [];
  const used = new Set<string>();
  const redirects = new Map<string, string>();

  // First pass: clean keywords and a main keyword per topic.
  type Draft = { t: FastAnswer['topics'][number]; kws: FastKeyword[]; main: FastKeyword; volume: number; name: string; ranking: string | null };
  const drafts: Draft[] = [];
  for (const t of answer.topics) {
    // Keywords: only real candidates, still clean (brand, banned words, not sold), each in one topic.
    const kws: FastKeyword[] = [];
    for (const k of t.keywords) {
      const c = byTerm.get(normTerm(k.keyword));
      if (!c) continue;
      const again = prefilterReason({ ...c, term: k.keyword }, p);
      if (again && again.reason !== 'low_value') {
        removed.push({ keyword: k.keyword, reason: again.reason, detail: again.detail, by: 'code' });
        continue;
      }
      if (used.has(c.term)) continue;
      used.add(c.term);
      kws.push({ keyword: c.term, volume: c.volume, role: k.role === 'question' || t.intent === 'learn' ? 'question' : 'supporting', position: c.position, difficulty: c.difficulty, cpc: c.cpc, variants: c.variants });
    }
    if (!kws.length) continue;
    // Main keyword = the most searched buy/compare keyword (a question only when the topic is all questions).
    const main = [...kws].filter((k) => k.role !== 'question').sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0] ?? kws[0]!;
    main.role = t.intent === 'learn' ? 'question' : 'main';
    kws.sort((a, b) => Number(b === main) - Number(a === main) || (b.volume ?? 0) - (a.volume ?? 0));
    // Never a topic named after a brand: use the main keyword instead.
    const brandy = foreignBrand(t.topic, p) || [...p.brandsStocked, ...p.ownBrands].some((b) => b && ` ${normTerm(t.topic)} `.includes(` ${normTerm(b)} `));
    const name = brandy ? titleCase(main.keyword) : t.topic.trim() || titleCase(main.keyword);
    const ranking = kws.map((k) => byTerm.get(normTerm(k.keyword))?.url).find(Boolean) ?? null;
    drafts.push({ t, kws, main, volume: kws.reduce((s, k) => s + (k.volume ?? 0), 0), name, ranking });
  }

  // Second pass, most valuable topic first: one topic per live page. A page already taken is never shared;
  // the topic gets the next-best page, a new page (real category, 100+ searches) or is dropped.
  drafts.sort((a, b) => b.volume * WEIGHT[b.t.intent] - a.volume * WEIGHT[a.t.intent]);
  const taken = new Set<string>();
  // Pages the AI chose from the live list are claimed first (most valuable topic wins); name matching only fills the rest.
  const chosen = new Map<Draft, LivePage>();
  for (const d of drafts) {
    const x = d.t.page_url && d.t.page_url !== 'new' ? liveBy.get(normUrl(d.t.page_url)) : undefined;
    if (x && !taken.has(normUrl(x.url))) {
      chosen.set(d, x);
      taken.add(normUrl(x.url));
    }
  }
  const topics: FastTopic[] = [];
  for (const d of drafts) {
    const { t, kws, main, volume, name, ranking } = d;
    const learn = t.intent === 'learn';
    let page: LivePage | null = chosen.get(d) ?? null;
    // Questions are articles or FAQs, never matched onto a product or category page by name.
    if (!page && !learn) page = matchPages(`${t.page_name} ${name} ${main.keyword}`, live).find((x) => !taken.has(normUrl(x.url))) ?? null;
    for (const old of [t.page_url, ranking]) {
      if (!old || old === 'new' || !page || liveBy.has(normUrl(old))) continue;
      const s = statusOf(old);
      if (s !== null && s !== 200) redirects.set(old, page.url);
    }
    let isNew = false;
    if (!page) {
      if (volume >= NEW_PAGE_MIN_VOLUME) isNew = true;
      else {
        for (const k of kws) removed.push({ keyword: k.keyword, reason: 'low_value', detail: 'no free live page and too few searches for a new one', by: 'code' });
        continue;
      }
    } else taken.add(normUrl(page.url));
    const position = kws.map((k) => k.position).filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
    const opportunity: FastOpportunity = learn ? 'article' : isNew ? 'new_page' : position !== null && position <= 3 ? 'top' : position !== null && position <= 20 && position >= 4 ? 'quick_win' : 'optimise';
    topics.push({ id: '', topic: name, mainKeyword: main.keyword, intent: t.intent, pageUrl: page?.url ?? null, pageName: page?.name ?? titleCase(main.keyword), isNew, keywords: kws, volume, position, opportunity });
  }

  // Ranking pages that are gone (404, redirected) for any kept keyword: point them at the topic's live page.
  for (const tp of topics) for (const k of tp.keywords) {
    const u = byTerm.get(normTerm(k.keyword))?.url;
    if (!u || !tp.pageUrl || liveBy.has(normUrl(u)) || redirects.has(u)) continue;
    const s = statusOf(u);
    if (s !== null && s !== 200) redirects.set(u, tp.pageUrl);
  }

  // Sorted by value; at most 25 topics and 80 keywords (main keywords first).
  topics.sort((a, b) => b.volume * WEIGHT[b.intent] - a.volume * WEIGHT[a.intent]);
  for (const t of topics.slice(FAST_MAX_TOPICS)) for (const k of t.keywords) removed.push({ keyword: k.keyword, reason: 'low_value', detail: `not in the best ${FAST_MAX_TOPICS} topics`, by: 'code' });
  const kept = topics.slice(0, FAST_MAX_TOPICS);
  let room = FAST_MAX_KEYWORDS - kept.length;
  for (const t of kept) {
    const extra = t.keywords.slice(1);
    const take = Math.max(0, Math.min(extra.length, room));
    for (const k of extra.slice(take)) removed.push({ keyword: k.keyword, reason: 'low_value', detail: `not in the best ${FAST_MAX_KEYWORDS} keywords`, by: 'code' });
    t.keywords = [t.keywords[0]!, ...extra.slice(0, take)];
    room -= take;
  }
  kept.forEach((t, i) => (t.id = `fast-${i + 1}-${variantKey(t.topic).replace(/ /g, '-').slice(0, 40)}`));
  const keptTerms = new Set(kept.flatMap((t) => t.keywords.map((k) => k.keyword)));
  // A keyword the AI also listed as removed but that a topic kept is not "removed".
  const seen = new Set<string>();
  const outRemoved = removed.filter((r) => !keptTerms.has(byTerm.get(normTerm(r.keyword))?.term ?? r.keyword) && !seen.has(normTerm(r.keyword)) && seen.add(normTerm(r.keyword)));
  if (topics.length > kept.length) notes.push(`Kept the best ${FAST_MAX_TOPICS} of ${topics.length} topics.`);
  return {
    topics: kept,
    removed: outRemoved,
    askClient: answer.ask_client.filter((a) => a.keyword.trim()).slice(0, 5),
    redirects: [...redirects].map(([from, to]) => ({ from, to })),
    notes,
  };
}

/** Without the AI step (no key or it failed): one topic per category the business sells, by words. */
export function codeAnswer(candidates: FastCandidate[], p: FastProfile): FastAnswer {
  const cats = p.categories.filter(Boolean);
  const topics = cats.map((cat) => {
    const w = words(cat);
    const kws = candidates.filter((c) => {
      const have = words(c.term);
      return w.size > 0 && [...w].every((x) => have.has(x));
    });
    const page = matchPage(cat, p.livePages.filter((x) => x.status === 200));
    return {
      topic: titleCase(cat), main_keyword: kws[0]?.term ?? cat, intent: 'buy' as const, page_url: page?.url ?? 'new', page_name: page?.name ?? '', is_new_page: !page,
      keywords: kws.map((c) => ({ keyword: c.term, volume: c.volume ?? 0, role: (/^(how|what|why|which|is|are|can|do|does|should)\b/.test(c.term) ? 'question' : 'supporting') as FastRole })),
    };
  });
  return { topics, removed: [], ask_client: [] };
}
