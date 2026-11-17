import { COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, normDomain } from '../competitors/competitors';
import { csvCell } from '../report/csv';
import { validKeyword, type KeywordClient, type KeywordMetrics, type Locale } from '../providers/dataforseo-keywords';
import { cleanKeywords, normTerm } from './clean';
import type { KeywordRecord, KeywordSeeds, KeywordSource, KeywordStatus, KeywordWorkspace } from './types';

/**
 * Module 4 · Keyword research: 4.1 seeds, 4.2 sources, 4.3 metrics, 4.4 cleaning (clean.ts),
 * 4.5–4.6 clusters and priority (cluster.ts), 4.7 AI prompts (prompts.ts), CSV in and out.
 */
export const MAX_KEYWORDS = 1500;
export const SEED_LIMITS = { services: 12, locations: 10, brands: 10, extra: 30 } as const;

export function emptyKeywordWorkspace(domain: string, init: Partial<Pick<KeywordWorkspace, 'country' | 'language'>> & { seeds?: Partial<KeywordSeeds> } = {}): KeywordWorkspace {
  const country = (COMPETITOR_COUNTRIES as readonly string[]).includes(init.country ?? '') ? init.country! : 'United States';
  const language = init.language && init.language in COMPETITOR_LANGUAGES ? init.language : 'en';
  const clip = (l: string[] | undefined, n: number) => [...new Set((l ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, n);
  return {
    domain: normDomain(domain),
    country,
    language,
    seeds: {
      services: clip(init.seeds?.services, SEED_LIMITS.services),
      locations: clip(init.seeds?.locations, SEED_LIMITS.locations),
      brands: clip(init.seeds?.brands, SEED_LIMITS.brands),
      extra: clip(init.seeds?.extra, SEED_LIMITS.extra),
    },
    keywords: [],
    clusters: [],
    prompts: [],
    lastRunAt: null,
    clusteredAt: null,
    promptsAt: null,
  };
}

const HVAC = /\b(ac|a\/c|hvac|air condition\w*|furnace|heat\w*|cooling|duct\w*|boiler|mini split)\b/i;
const SYMPTOMS = ['ac not cooling', 'ac blowing warm air', 'furnace not turning on', 'heat pump not heating', 'ac leaking water', 'ac making noise', 'no heat in house', 'ac frozen coil'];

/** 4.1 Seed list: services × places, modifiers (near me, emergency, cost, best), brands, symptoms, questions. */
export function buildSeeds(seeds: KeywordSeeds): string[] {
  const services = seeds.services.map(normTerm).filter(Boolean);
  const places = seeds.locations.map(normTerm).filter(Boolean);
  const out: string[] = [];
  for (const s of services) {
    out.push(s, `${s} near me`, `emergency ${s}`, `${s} cost`, `best ${s}`, `how much does ${s} cost`);
    for (const l of places) out.push(`${s} ${l}`, `best ${s} ${l}`, `${s} company ${l}`);
    for (const b of seeds.brands.map(normTerm).filter(Boolean)) out.push(`${b} ${s}`);
  }
  if (services.some((s) => HVAC.test(s))) out.push(...SYMPTOMS);
  out.push(...seeds.extra.map(normTerm));
  return [...new Set(out)].filter(validKeyword).slice(0, 300);
}

export type GscQuery = { query: string; clicks: number; impressions: number; position: number; page?: string };

const blank = (term: string, source: KeywordSource, now: string): KeywordRecord => ({
  term, volume: null, trend: null, trendFrom: null, difficulty: null, cpc: null, intent: null, position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: [source], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: now,
});

/** Merges keywords into a map by term; metrics only fill gaps or refresh, choices are never lost. */
class Collector {
  readonly map: Map<string, KeywordRecord>;
  constructor(existing: KeywordRecord[], private now: string) {
    this.map = new Map(existing.map((k) => [k.term, k]));
  }
  add(rawTerm: string, source: KeywordSource, m?: Partial<KeywordMetrics> & { position?: number | null; url?: string | null }) {
    const term = normTerm(rawTerm);
    if (!validKeyword(term)) return;
    const prev = this.map.get(term) ?? blank(term, source, this.now);
    const next: KeywordRecord = { ...prev, sources: prev.sources.includes(source) ? prev.sources : [...prev.sources, source] };
    if (m) {
      for (const f of ['volume', 'trend', 'trendFrom', 'difficulty', 'cpc', 'intent'] as const) if (m[f] !== undefined && m[f] !== null) (next as Record<string, unknown>)[f] = m[f];
      if (m.position != null && (next.position === null || source === 'ranked' || m.position < next.position)) [next.position, next.url] = [m.position, m.url ?? next.url];
    }
    this.map.set(term, next);
  }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

const SOURCE_RANK: Record<KeywordSource, number> = { manual: 0, import: 0, gsc: 1, seed: 2, ranked: 3, autocomplete: 4, suggestion: 5, competitor: 6 };

/**
 * 4.2 + 4.3 + 4.4: collects keywords from every source, fills in metrics for the ones that
 * have none, then applies the cleaning rules. Competitors: shortlisted (or direct) domains.
 */
export async function researchKeywords(
  client: KeywordClient,
  ws: KeywordWorkspace,
  opts: { competitors?: string[]; competitorNames?: string[]; gsc?: GscQuery[]; now?: Date } = {},
): Promise<{ workspace: KeywordWorkspace; cost: number; errors: string[]; added: number; calls: number }> {
  const now = (opts.now ?? new Date()).toISOString();
  const locale: Locale = { country: ws.country, language: ws.language };
  const c = new Collector(ws.keywords, now);
  const before = c.map.size;
  const errors: string[] = [];
  let cost = 0;
  let calls = 0;
  const run = async (label: string, fn: () => Promise<number | void>) => {
    try {
      calls++;
      cost += (await fn()) || 0;
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const services = ws.seeds.services.map(normTerm).filter(Boolean);
  const places = ws.seeds.locations.map(normTerm).filter(Boolean);
  for (const s of buildSeeds(ws.seeds)) c.add(s, 'seed');
  for (const q of (opts.gsc ?? []).sort((a, b) => b.impressions - a.impressions).slice(0, 300)) {
    c.add(q.query, 'gsc', { position: Math.round(q.position * 10) / 10, url: q.page ?? null });
    const k = c.map.get(normTerm(q.query));
    if (k) c.map.set(k.term, { ...k, gscClicks: q.clicks, gscImpressions: q.impressions });
  }

  const autoSeeds = (places.length ? services.flatMap((s) => places.slice(0, 2).map((l) => `${s} ${l}`)) : services).slice(0, 6);
  const tasks: (() => Promise<void>)[] = [
    () => run('Your rankings', async () => {
      const r = await client.rankedKeywords(ws.domain, locale, 300);
      for (const k of r.keywords) c.add(k.term, 'ranked', k);
      return r.cost;
    }),
    ...(opts.competitors ?? []).slice(0, 3).map((d) => () => run(`Competitor ${d}`, async () => {
      const r = await client.rankedKeywords(normDomain(d), locale, 150);
      for (const k of r.keywords) c.add(k.term, 'competitor', { ...k, position: null, url: null });
      return r.cost;
    })),
    ...services.slice(0, 5).map((s) => () => run(`Ideas for "${s}"`, async () => {
      const r = await client.suggestions(s, locale, 80);
      for (const k of r.keywords) c.add(k.term, 'suggestion', k);
      return r.cost;
    })),
    ...autoSeeds.map((s) => () => run(`Google suggestions for "${s}"`, async () => {
      const r = await client.autocomplete(s, locale);
      for (const t of r.suggestions) c.add(t, 'autocomplete');
      return r.cost;
    })),
  ];
  await pool(tasks, 5, (t) => t());

  // Keep the most useful keywords if the list is over the cap, then fill in missing metrics.
  let list = [...c.map.values()];
  if (list.length > MAX_KEYWORDS) {
    list = list
      .sort((a, b) => Number(b.statusLocked) - Number(a.statusLocked) || Math.min(...a.sources.map((s) => SOURCE_RANK[s])) - Math.min(...b.sources.map((s) => SOURCE_RANK[s])) || (b.volume ?? -1) - (a.volume ?? -1))
      .slice(0, MAX_KEYWORDS);
  }
  const keep = new Map(list.map((k) => [k.term, k]));
  const needMetrics = list.filter((k) => k.volume === null && k.difficulty === null).map((k) => k.term);
  for (let i = 0; i < needMetrics.length; i += 700) {
    await run('Keyword metrics', async () => {
      const r = await client.overview(needMetrics.slice(i, i + 700), locale);
      for (const m of r.keywords) {
        const k = keep.get(m.term);
        if (k) keep.set(k.term, { ...k, volume: m.volume, trend: m.trend, trendFrom: m.trendFrom, difficulty: m.difficulty, cpc: m.cpc, intent: m.intent });
      }
      return r.cost;
    });
  }
  // A keyword with no data from Google: 0 searches recorded ("customer language", kept).
  const asked = new Set(needMetrics);
  const filled = [...keep.values()].map((k) => (k.volume === null && asked.has(k.term) && !errors.some((e) => e.startsWith('Keyword metrics')) ? { ...k, volume: 0 } : k));
  const cleaned = cleanKeywords({ ...ws, keywords: sortKeywords(filled) }, opts.competitorNames ?? opts.competitors ?? []);
  return { workspace: { ...cleaned, lastRunAt: now }, cost, errors, added: Math.max(0, keep.size - before), calls };
}

export const sortKeywords = (list: KeywordRecord[]) => [...list].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.term.localeCompare(b.term));

/** Keep or remove by hand (locks the choice against the cleaning rules). */
export function setKeywordStatus(ws: KeywordWorkspace, term: string, status: KeywordStatus): KeywordWorkspace {
  return {
    ...ws,
    keywords: ws.keywords.map((k) =>
      k.term !== term ? k : { ...k, status, statusLocked: true, removeReason: status === 'removed' ? 'Removed by hand' : null, clusterId: status === 'removed' ? null : k.clusterId },
    ),
  };
}

/** Adds keywords typed in or imported from CSV (kept, metrics filled on the next research run). */
export function addKeywords(ws: KeywordWorkspace, terms: string[], source: 'manual' | 'import', now = new Date()): { workspace: KeywordWorkspace; added: string[] } {
  const c = new Collector(ws.keywords, now.toISOString());
  const added: string[] = [];
  for (const t of terms) {
    const term = normTerm(t);
    if (!validKeyword(term) || c.map.size >= MAX_KEYWORDS) continue;
    if (!c.map.has(term)) added.push(term);
    c.add(term, source);
    const k = c.map.get(term)!;
    c.map.set(term, { ...k, status: 'kept', statusLocked: true, removeReason: null });
  }
  return { workspace: { ...ws, keywords: sortKeywords([...c.map.values()]) }, added };
}

/** Fills metrics for keywords that have none (after an import), without a full research run. */
export async function fillMetrics(client: KeywordClient, ws: KeywordWorkspace, terms: string[]): Promise<{ workspace: KeywordWorkspace; cost: number }> {
  if (!terms.length) return { workspace: ws, cost: 0 };
  const r = await client.overview(terms.slice(0, 700), { country: ws.country, language: ws.language });
  const by = new Map(r.keywords.map((m) => [m.term, m]));
  return {
    cost: r.cost,
    workspace: {
      ...ws,
      keywords: sortKeywords(ws.keywords.map((k) => {
        const m = by.get(k.term);
        if (m) return { ...k, volume: m.volume, trend: m.trend, trendFrom: m.trendFrom, difficulty: m.difficulty, cpc: m.cpc, intent: m.intent };
        return terms.includes(k.term) && k.volume === null ? { ...k, volume: 0 } : k;
      })),
    },
  };
}

export function keywordStats(ws: KeywordWorkspace) {
  const kept = ws.keywords.filter((k) => k.status === 'kept');
  return {
    kept: kept.length,
    removed: ws.keywords.length - kept.length,
    customerLanguage: kept.filter((k) => !k.volume).length,
    clusters: ws.clusters.length,
    quickWins: ws.clusters.filter((c) => c.quickWin).length,
    volume: kept.reduce((s, k) => s + (k.volume ?? 0), 0),
  };
}

/** The best commercial clusters as competitor searches (Module 3.3 core searches). */
export function competitorSearchesFromClusters(ws: KeywordWorkspace, max = 15): string[] {
  return ws.clusters.filter((c) => c.intent !== 'informational' && c.pageType !== 'blog_post').slice(0, max).map((c) => c.head);
}

// ---- CSV ----------------------------------------------------------------------------------

const HEADER = ['keyword', 'status', 'reason', 'cluster', 'volume', 'difficulty', 'cpc', 'intent', 'position', 'url', 'gsc_clicks', 'gsc_impressions', 'sources'];

export function keywordsToCsv(ws: KeywordWorkspace): string {
  const names = new Map(ws.clusters.map((c) => [c.id, c.name]));
  const rows = ws.keywords.map((k) => [
    k.term, k.status, k.removeReason ?? '', k.clusterId ? names.get(k.clusterId) ?? '' : '', k.volume ?? '', k.difficulty ?? '', k.cpc === null ? '' : k.cpc.toFixed(2),
    k.intent ?? '', k.position ?? '', k.url ?? '', k.gscClicks ?? '', k.gscImpressions ?? '', k.sources.join(' '),
  ]);
  return `﻿${[HEADER, ...rows].map((r) => r.map((v) => csvCell(v)).join(',')).join('\r\n')}\r\n`;
}

/** Parses one CSV row (RFC 4180 quotes). */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') [cur, i] = [cur + '"', i + 1];
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  return [...out, cur];
}

/** Keywords from an uploaded CSV: the "keyword"/"query"/"term" column, or the first column. */
export function parseKeywordCsv(text: string, max = 1000): string[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitRow(lines[0]!).map((h) => h.trim().toLowerCase());
  let col = head.findIndex((h) => /^(keyword|keywords|query|queries|term|search term|top queries)$/.test(h));
  const body = col >= 0 ? lines.slice(1) : lines;
  if (col < 0) col = 0;
  const terms = body.map((l) => normTerm(splitRow(l)[col]?.replace(/^'/, '') ?? '')).filter(validKeyword);
  return [...new Set(terms)].slice(0, max);
}
