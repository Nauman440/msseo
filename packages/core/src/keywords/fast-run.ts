import type { KeywordClient, KeywordIntent, KeywordMetrics, RankedKeyword } from '../providers/dataforseo-keywords';
import type { OpenAiClient } from '../providers/openai';
import { KEYWORD_QUALITY_VERSION, normTerm } from './clean';
import { askFast, codeAnswer, postCheck, type AskClient, type FastAnswer, type FastTopic } from './fast-ai';
import { fastSeeds, prefilter, type FastCandidate, type FastProfile, type FastSource, type RemovedKeyword } from './fast-filter';
import type { GscQuery } from './keywords';
import type { KeywordCluster, KeywordRecord, KeywordWorkspace } from './types';

/**
 * Fast keyword pipeline (2026-11-25): seeds → data in parallel (cached 30 days per site) → code
 * pre-filter → one LLM call → code post-checks → one saved result that the Keywords tab and the
 * Page plan both read. Hard limits: 20 s per call, 120 s per run, $2 per run by default.
 */
export const CACHE_DAYS = 30;
export const CALL_TIMEOUT_MS = 20_000;
export const RUN_TIMEOUT_MS = 120_000;
export const COST_CAP_USD = 2;
const CONCURRENCY = 5;
/** Rough DataForSEO prices used only for the cap (a task plus a small charge per row). */
const ESTIMATE = { ideas: 0.1, ranked: 0.05, competitor: 0.04 };

export type FastStep = { step: string; ms: number; costUsd: number; note?: string };
export type FastResult = {
  domain: string;
  runAt: string;
  topics: FastTopic[];
  removed: RemovedKeyword[];
  askClient: AskClient[];
  redirects: { from: string; to: string }[];
  steps: FastStep[];
  totalMs: number;
  costUsd: number;
  aiTokens: number;
  /** True when every paid source and the AI answer came from the 30-day cache. */
  warm: boolean;
  notes: string[];
};
export type FastCache = {
  domain: string;
  /** Country, language and seeds: a change starts again. */
  scope: string;
  at: string;
  ideas?: KeywordMetrics[];
  ranked?: RankedKeyword[];
  competitors?: Record<string, RankedKeyword[]>;
  gsc?: GscQuery[];
  ai?: { key: string; answer: FastAnswer; tokens: number };
};
export type FastDeps = {
  kw: Pick<KeywordClient, 'keywordIdeas' | 'rankedKeywords' | 'keywordGap'> | null;
  ai: OpenAiClient | null;
  gsc?: () => Promise<GscQuery[]>;
  /** HTTP status of ranking addresses the crawl did not check (for the redirect list). */
  checkStatus?: (urls: string[]) => Promise<Record<string, number>>;
  now?: () => number;
};

const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Two FNV-1a passes (64 bits as hex): a cache key for the AI answer. Not for security; no node:crypto in this browser-safe package. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}${text.length.toString(16)}`;
}

/** Runs tasks with at most `n` at a time. */
async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (i < tasks.length) {
      const k = i++;
      out[k] = await tasks[k]!();
    }
  }));
  return out;
}
async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)} s`)), Math.max(1, ms));
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runFastKeywords(profile: FastProfile, deps: FastDeps, opts: { cache?: FastCache | null; force?: boolean; costCapUsd?: number } = {}): Promise<{ result: FastResult; cache: FastCache }> {
  const now = deps.now ?? Date.now;
  const start = now();
  const deadline = start + RUN_TIMEOUT_MS;
  const steps: FastStep[] = [];
  const notes: string[] = [];
  const cap = opts.costCapUsd ?? COST_CAP_USD;
  let spent = 0;
  const step = (name: string, t0: number, costUsd = 0, note?: string) => steps.push({ step: name, ms: now() - t0, costUsd: Math.round(costUsd * 10_000) / 10_000, ...(note ? { note } : {}) });

  // Site isolation: competitors are other sites, live pages are this site's, a cache from another site is never used.
  const domain = profile.domain.replace(/^www\./, '').toLowerCase();
  const p: FastProfile = {
    ...profile,
    competitors: profile.competitors.map((c) => c.replace(/^www\./, '').toLowerCase()).filter((c) => c && c !== domain).slice(0, 3),
    livePages: profile.livePages.filter((x) => hostOf(x.url) === domain || hostOf(x.url) === '' || hostOf(x.url).endsWith(`.${domain}`)),
  };
  let t0 = now();
  const seeds = fastSeeds(p);
  const scope = `${p.country}|${p.language}|${seeds.join(',')}`;
  const fresh = (c: FastCache | null | undefined): c is FastCache => Boolean(c && c.domain === domain && c.scope === scope && now() - Date.parse(c.at) < CACHE_DAYS * 86_400_000);
  const reuse = !opts.force && fresh(opts.cache);
  if (opts.cache && opts.cache.domain !== domain) notes.push('Ignored saved data that belongs to another website.');
  const cache: FastCache = reuse ? { ...opts.cache!, competitors: { ...(opts.cache!.competitors ?? {}) } } : { domain, scope, at: new Date(now()).toISOString(), competitors: {} };
  step('seeds', t0, 0, `${seeds.length} seeds`);

  // Step 3: data, in parallel, each source optional.
  const locale = { country: p.country, language: p.language };
  const left = () => Math.max(1_000, Math.min(CALL_TIMEOUT_MS, deadline - now() - 30_000));
  const affordable = (est: number, what: string) => {
    if (spent + est > cap) {
      notes.push(`Skipped ${what}: it would pass the $${cap.toFixed(2)} limit for one run.`);
      return false;
    }
    spent += est;
    return true;
  };
  const fetchStep = async (name: string, have: boolean, est: number, run: () => Promise<number>, available = Boolean(deps.kw)) => {
    const t = now();
    if (have) return step(name, t, 0, 'cached');
    if (!available) return step(name, t, 0, 'not available');
    if (est > 0 && !affordable(est, name)) return step(name, t, 0, 'over the cost limit');
    try {
      const cost = await withTimeout(run(), left(), name);
      spent += cost - est;
      step(name, t, cost);
    } catch (e) {
      spent -= est;
      notes.push(`${name} did not answer (${e instanceof Error ? e.message : 'error'}); continued without it.`);
      step(name, t, 0, 'failed');
    }
  };
  t0 = now();
  await pool([
    () => fetchStep('ideas', Boolean(cache.ideas), ESTIMATE.ideas, async () => {
      const r = await deps.kw!.keywordIdeas(seeds, locale, 700, CALL_TIMEOUT_MS);
      cache.ideas = r.keywords;
      return r.cost;
    }),
    () => fetchStep('ranked', Boolean(cache.ranked), ESTIMATE.ranked, async () => {
      const r = await deps.kw!.rankedKeywords(domain, locale, 300, CALL_TIMEOUT_MS);
      cache.ranked = r.keywords;
      return r.cost;
    }),
    ...p.competitors.map((c) => () => fetchStep(`competitor ${c}`, Boolean(cache.competitors?.[c]), ESTIMATE.competitor, async () => {
      // Only keywords the client does not rank for (domain intersection without the shared ones).
      const r = await deps.kw!.keywordGap(c, domain, locale, 200, CALL_TIMEOUT_MS);
      cache.competitors![c] = r.keywords;
      return r.cost;
    })),
    () => fetchStep('gsc', Boolean(cache.gsc), 0, async () => {
      const rows = await deps.gsc!();
      cache.gsc = [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, 300);
      return 0;
    }, Boolean(deps.gsc)),
  ], CONCURRENCY);
  step('collect', t0, 0);

  // Candidates from every source, merged by keyword.
  t0 = now();
  const all = new Map<string, FastCandidate>();
  const add = (term: string, src: FastSource, m: Partial<FastCandidate>) => {
    const key = normTerm(term);
    if (!key) return;
    const c = all.get(key) ?? { term: key, volume: null, difficulty: null, cpc: null, position: null, url: null, gscImpressions: null, sources: [], variants: [] };
    c.volume ??= m.volume ?? null;
    c.difficulty ??= m.difficulty ?? null;
    c.cpc ??= m.cpc ?? null;
    if (m.position !== undefined && m.position !== null && (c.position === null || m.position < c.position)) [c.position, c.url] = [m.position, m.url ?? c.url];
    if (m.gscImpressions) c.gscImpressions = (c.gscImpressions ?? 0) + m.gscImpressions;
    if (!c.sources.includes(src)) c.sources.push(src);
    all.set(key, c);
  };
  for (const k of cache.ranked ?? []) add(k.term, 'ranked', { volume: k.volume, difficulty: k.difficulty, cpc: k.cpc, position: k.position, url: k.url });
  for (const k of cache.ideas ?? []) add(k.term, 'ideas', { volume: k.volume, difficulty: k.difficulty, cpc: k.cpc });
  for (const c of p.competitors) for (const k of cache.competitors?.[c] ?? []) add(k.term, 'competitor', { volume: k.volume, difficulty: k.difficulty, cpc: k.cpc });
  for (const q of cache.gsc ?? []) add(q.query, 'gsc', { gscImpressions: q.impressions, position: q.position ? Math.round(q.position) : null, url: q.page ?? null });
  const { candidates, removed } = prefilter([...all.values()], p);
  step('prefilter', t0, 0, `${all.size} found, ${candidates.length} for the AI`);

  // Step 5: one AI call (cached by exactly what is sent), with the status check of gone ranking pages alongside.
  t0 = now();
  const key = fingerprint(JSON.stringify([p, candidates.map((c) => [c.term, c.volume, c.position, c.url])]));
  const gone = [...new Set(candidates.map((c) => c.url).filter((u): u is string => Boolean(u) && !p.livePages.some((x) => normUrl(x.url) === normUrl(u!))))].slice(0, 30);
  const statusP = deps.checkStatus && gone.length ? deps.checkStatus(gone).catch(() => ({})) : Promise.resolve({});
  let answer: FastAnswer;
  let tokens = 0;
  let aiCached = false;
  if (!opts.force && cache.ai?.key === key) {
    answer = cache.ai.answer;
    aiCached = true;
    step('ai', t0, 0, 'cached');
  } else if (deps.ai && candidates.length) {
    try {
      const r = await askFast(deps.ai, p, candidates, Math.max(10_000, deadline - now() - 5_000));
      answer = r.answer;
      tokens = r.tokens;
      cache.ai = { key, answer, tokens };
      step('ai', t0, 0, `${r.calls} call(s), ${tokens.toLocaleString('en-US')} tokens, ${r.model}`);
    } catch (e) {
      notes.push(`The AI step did not answer (${e instanceof Error ? e.message : 'error'}); topics were grouped by category instead.`);
      answer = codeAnswer(candidates, p);
      step('ai', t0, 0, 'failed: grouped by category');
    }
  } else {
    answer = codeAnswer(candidates, p);
    step('ai', t0, 0, candidates.length ? 'no AI key: grouped by category' : 'nothing to check');
  }
  const statuses = Object.fromEntries(Object.entries(await statusP).map(([u, s]) => [normUrl(u), s]));

  t0 = now();
  const post = postCheck(answer, candidates, p, statuses);
  step('post-checks', t0, 0, `${post.topics.length} topics, ${post.topics.reduce((s, t) => s + t.keywords.length, 0)} keywords`);

  const paid = steps.filter((s) => s.costUsd > 0);
  const result: FastResult = {
    domain,
    runAt: new Date(now()).toISOString(),
    topics: post.topics,
    removed: [...removed, ...post.removed],
    askClient: post.askClient,
    redirects: post.redirects,
    steps,
    totalMs: now() - start,
    costUsd: Math.round(paid.reduce((s, x) => s + x.costUsd, 0) * 10_000) / 10_000,
    aiTokens: tokens,
    warm: reuse && aiCached && !paid.length,
    notes: [...notes, ...post.notes],
  };
  return { result, cache };
}

// ---- Saving: the keyword list and topics the rest of the app reads ---------------------------------

const INTENT: Record<FastTopic['intent'], KeywordIntent> = { buy: 'transactional', local: 'transactional', compare: 'commercial', learn: 'informational' };
const REASON_TEXT: Record<string, string> = {
  brand: 'Another brand', not_sold: 'Something you do not sell', wrong_intent: 'Not someone ready to buy', location: 'Another place', claim: 'A claim you cannot make',
  irrelevant: 'Not about what you sell', low_value: 'Too few searches or lower value', language: 'Another language',
};
export const removedLabel = (r: string) => REASON_TEXT[r] ?? 'Left out';

/**
 * Writes the result into the workspace: the kept keywords (one topic each) and the topics as clusters,
 * so the page plan, the action plan and monitoring read the same list. Keywords a person kept, typed
 * or imported are never removed.
 */
export function applyFastResult(ws: KeywordWorkspace, r: FastResult, cache: FastCache): KeywordWorkspace {
  if (r.domain !== ws.domain.replace(/^www\./, '').toLowerCase()) throw new Error(`Fast keyword result for ${r.domain} cannot be saved on ${ws.domain}`);
  const at = r.runAt;
  const byHand = (k: KeywordRecord) => k.statusLocked || k.sources.some((s) => s === 'manual' || s === 'import');
  const old = new Map(ws.keywords.map((k) => [normTerm(k.term), k]));
  const keywords: KeywordRecord[] = [];
  const clusters: KeywordCluster[] = r.topics.map((t, i) => ({
    id: t.id, name: t.topic, head: t.mainKeyword, size: t.keywords.length, intent: INTENT[t.intent],
    pageType: t.intent === 'learn' ? 'blog_post' : 'category', volume: t.volume, businessValue: t.intent === 'learn' ? 2 : 5, rankingChance: t.position !== null && t.position <= 20 ? 5 : 3, scoresLocked: false,
    priority: Math.max(1, 25 - i), bestPosition: t.position, bestUrl: t.pageUrl, quickWin: t.opportunity === 'quick_win', longTerm: false, seasonalPeak: null, seasonalDeadline: null,
  }));
  for (const t of r.topics) for (const k of t.keywords) {
    const prev = old.get(k.keyword);
    keywords.push({
      term: k.keyword, volume: k.volume, trend: prev?.trend ?? null, trendFrom: prev?.trendFrom ?? null, difficulty: k.difficulty, cpc: k.cpc, intent: INTENT[t.intent],
      position: k.position, url: prev?.url ?? null, gscClicks: prev?.gscClicks ?? null, gscImpressions: prev?.gscImpressions ?? null, sources: prev?.sources ?? ['suggestion'],
      status: 'kept', removeReason: null, statusLocked: prev?.statusLocked ?? false, serpUrls: prev?.serpUrls ?? null, serpFeatures: prev?.serpFeatures ?? null, clusterId: t.id, addedAt: prev?.addedAt ?? at,
    });
  }
  const keptTerms = new Set(keywords.map((k) => k.term));
  for (const k of ws.keywords) if (byHand(k) && !keptTerms.has(normTerm(k.term))) keywords.push(k);
  const seen = new Set(keywords.map((k) => normTerm(k.term)));
  for (const x of r.removed) {
    const term = normTerm(x.keyword);
    if (seen.has(term)) continue;
    seen.add(term);
    const prev = old.get(term);
    keywords.push({
      term, volume: prev?.volume ?? null, trend: null, trendFrom: null, difficulty: prev?.difficulty ?? null, cpc: prev?.cpc ?? null, intent: prev?.intent ?? null, position: prev?.position ?? null,
      url: prev?.url ?? null, gscClicks: null, gscImpressions: null, sources: prev?.sources ?? ['suggestion'], status: 'removed', removeReason: `${removedLabel(x.reason)}${x.detail ? ` (${x.detail})` : ''}`,
      statusLocked: false, serpUrls: null, clusterId: null, addedAt: prev?.addedAt ?? at,
    });
  }
  return { ...ws, keywords, clusters, lastRunAt: at, clusteredAt: at, qualityVersion: KEYWORD_QUALITY_VERSION, fast: r, fastCache: cache };
}
