import { KNOWN_CITIES } from '../audit/templates';
import { DIRECTORIES } from '../competitors/competitors';
import type { KeywordClient, KeywordIntent, Locale } from '../providers/dataforseo-keywords';
import { dedupeKey, normTerm } from './clean';
import type { ClusterPageType, KeywordCluster, KeywordRecord, KeywordWorkspace } from './types';

/**
 * 4.5 Clustering by SERP overlap: two keywords belong together when Google shows at least
 * OVERLAP of the same top-10 URLs for both (one page can rank for both). Keywords without a
 * SERP (beyond the paid budget) join the cluster whose words they share. 4.6 scores each cluster.
 */
export const MAX_CLUSTER_SERPS = 60;
const OVERLAP = 3;
const SIMILAR = 0.6;

const normUrl = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
const hostOf = (u: string) => normUrl(u).split('/')[0] ?? '';
const isDirectory = (host: string) => [...DIRECTORIES].some((d) => host === d || host.endsWith(`.${d}`));
const tokens = (t: string) => new Set(dedupeKey(t).split(' ').filter(Boolean));
function jaccard(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared || 1);
}
const hasPhrase = (term: string, phrase: string) => phrase.length > 0 && ` ${term} `.includes(` ${phrase} `);
const namesPlace = (term: string, locations: string[]) => {
  const t = normTerm(term);
  return locations.some((l) => hasPhrase(t, normTerm(l))) || KNOWN_CITIES.some((c) => hasPhrase(t, c));
};

export const clusterId = (head: string) => normTerm(head).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cluster';

/** What kind of page ranks for the head keyword (from its SERP), or a guess from intent. */
export function pageTypeFor(head: KeywordRecord, locations: string[]): ClusterPageType {
  const local = namesPlace(head.term, locations);
  const urls = head.serpUrls ?? [];
  if (!urls.length) return head.intent === 'informational' ? 'blog_post' : local ? 'service_location' : 'service';
  if (urls.filter((u) => isDirectory(hostOf(u))).length >= 5) return 'directory';
  const votes: Record<string, number> = {};
  for (const u of urls) {
    if (isDirectory(hostOf(u))) continue;
    const path = normUrl(u).split('/').slice(1);
    const last = path[path.length - 1] ?? '';
    const kind = !path.length
      ? 'home'
      : path.some((p) => /^(blog|news|articles?|guides?|resources|learn|tips)$/.test(p)) || /^(how|what|why|when|can|does|is|should|signs)-/.test(last)
        ? 'blog_post'
        : path.some((p) => /^(areas?|locations?|service-areas?|cities)$/.test(p)) || KNOWN_CITIES.some((c) => last.includes(c.replace(/ /g, '-')))
          ? 'location'
          : 'service';
    votes[kind] = (votes[kind] ?? 0) + 1;
  }
  const top = (Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'service') as ClusterPageType;
  return top === 'location' && !local ? 'location' : top === 'location' || (top === 'service' && local) ? 'service_location' : top;
}

// Ready-to-buy searches are worth most; +1 when advertisers pay $10+ a click (CPC), +1 for 1,000+ searches a month.
const INTENT_VALUE: Record<KeywordIntent, number> = { transactional: 4, commercial: 3, informational: 2, navigational: 1 };
const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

/** 4.6 Seasonal peak (1–12) and the date the page should be live (two months before it). */
export function seasonality(members: KeywordRecord[], now: Date): { peak: number | null; deadline: string | null } {
  const byMonth = Array<number>(12).fill(0);
  let seen = 0;
  for (const k of members) {
    if (!k.trend?.length || !k.trendFrom) continue;
    const start = Number(k.trendFrom.slice(5, 7)) - 1;
    k.trend.forEach((v, i) => (byMonth[(start + i) % 12]! += v));
    seen++;
  }
  const total = byMonth.reduce((s, v) => s + v, 0);
  const mean = total / 12;
  if (!seen || mean < 50) return { peak: null, deadline: null };
  const peakIdx = byMonth.indexOf(Math.max(...byMonth));
  if (byMonth[peakIdx]! < mean * 1.4) return { peak: null, deadline: null };
  let year = now.getUTCFullYear();
  if (Date.UTC(year, peakIdx, 1) <= now.getTime()) year++;
  const due = new Date(Date.UTC(year, peakIdx - 2, 1));
  return { peak: peakIdx + 1, deadline: (due.getTime() < now.getTime() ? now : due).toISOString().slice(0, 10) };
}

export function defaultScores(members: KeywordRecord[], head: KeywordRecord, bestPosition: number | null): { businessValue: number; rankingChance: number } {
  const intent = head.intent ?? members.find((m) => m.intent)?.intent ?? null;
  const cpcs = members.map((m) => m.cpc).filter((c): c is number => c !== null);
  const cpc = cpcs.length ? cpcs.reduce((s, c) => s + c, 0) / cpcs.length : 0;
  const volume = members.reduce((s, m) => s + (m.volume ?? 0), 0);
  const businessValue = clamp((intent ? INTENT_VALUE[intent] : 2) + (cpc >= 10 ? 1 : 0) + (volume >= 1000 ? 1 : 0));
  const kd = head.difficulty ?? members.find((m) => m.difficulty !== null)?.difficulty ?? null;
  let chance = kd === null ? 3 : kd < 15 ? 5 : kd < 30 ? 4 : kd < 50 ? 3 : kd < 70 ? 2 : 1;
  if (bestPosition !== null) chance = bestPosition <= 3 ? 5 : chance + (bestPosition <= 20 ? 1 : 0);
  return { businessValue, rankingChance: clamp(chance) };
}

/** Builds (or rebuilds) one cluster's numbers from its keywords; hand-set scores are kept. */
export function summarise(head: KeywordRecord, members: KeywordRecord[], pageType: ClusterPageType, prev: KeywordCluster | undefined, now: Date): KeywordCluster {
  const ranked = members.filter((m) => m.position !== null).sort((a, b) => a.position! - b.position!);
  const best = ranked[0] ?? null;
  const scores = prev?.scoresLocked ? { businessValue: prev.businessValue, rankingChance: prev.rankingChance } : defaultScores(members, head, best?.position ?? null);
  const intents = members.map((m) => m.intent).filter(Boolean) as KeywordIntent[];
  const intent = head.intent ?? (intents.sort((a, b) => intents.filter((x) => x === b).length - intents.filter((x) => x === a).length)[0] ?? null);
  const quickWin = best !== null && best.position! >= 4 && best.position! <= 20;
  const season = seasonality(members, now);
  return {
    id: clusterId(head.term),
    name: prev?.scoresLocked && prev.name ? prev.name : head.term.charAt(0).toUpperCase() + head.term.slice(1),
    head: head.term,
    size: members.length,
    intent,
    pageType,
    volume: members.reduce((s, m) => s + (m.volume ?? 0), 0),
    ...scores,
    scoresLocked: prev?.scoresLocked ?? false,
    priority: scores.businessValue * scores.rankingChance,
    bestPosition: best?.position ?? null,
    bestUrl: best?.url ?? null,
    quickWin,
    longTerm: !quickWin && scores.rankingChance <= 2 && scores.businessValue >= 4,
    seasonalPeak: season.peak,
    seasonalDeadline: season.deadline,
  };
}

export const sortClusters = (list: KeywordCluster[]) => [...list].sort((a, b) => b.priority - a.priority || b.volume - a.volume || a.name.localeCompare(b.name));

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

/** 4.5 + 4.6: SERPs for the most searched kept keywords (cached per keyword), then groups and scores. */
export async function clusterKeywords(
  client: KeywordClient | null,
  ws: KeywordWorkspace,
  opts: { maxSerps?: number; now?: Date } = {},
): Promise<{ workspace: KeywordWorkspace; cost: number; errors: string[]; serps: number }> {
  const now = opts.now ?? new Date();
  const locale: Locale = { country: ws.country, language: ws.language };
  const byVolume = (a: KeywordRecord, b: KeywordRecord) => (b.volume ?? -1) - (a.volume ?? -1) || a.term.localeCompare(b.term);
  const kept = ws.keywords.filter((k) => k.status === 'kept').sort(byVolume);
  const serp = new Map(kept.filter((k) => k.serpUrls).map((k) => [k.term, k.serpUrls!]));
  const errors: string[] = [];
  let cost = 0;
  let serps = 0;
  const missing = kept.slice(0, opts.maxSerps ?? MAX_CLUSTER_SERPS).filter((k) => !serp.has(k.term));
  if (client) {
    await pool(missing, 5, async (k) => {
      try {
        const r = await client.serpUrls(k.term, locale);
        cost += r.cost;
        serps++;
        serp.set(k.term, r.urls);
      } catch (err) {
        errors.push(`"${k.term}": ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
  const withSerp = kept.map((k) => (serp.has(k.term) ? { ...k, serpUrls: serp.get(k.term)! } : k));

  type Group = { head: KeywordRecord; members: KeywordRecord[]; urls: Set<string> | null; tok: Set<string> };
  const groups: Group[] = [];
  for (const k of withSerp) {
    const urls = k.serpUrls?.length ? new Set(k.serpUrls.map(normUrl)) : null;
    const tok = tokens(k.term);
    let best: Group | null = null;
    let bestScore = 0;
    for (const g of groups) {
      if (urls && g.urls) {
        let shared = 0;
        for (const u of urls) if (g.urls.has(u)) shared++;
        if (shared >= OVERLAP && shared > bestScore) [best, bestScore] = [g, shared];
      } else {
        // Without both SERPs, fall back to shared words (scored below any SERP match).
        const j = jaccard(tok, g.tok);
        if (j >= SIMILAR && j > bestScore && bestScore < 1) [best, bestScore] = [g, j];
      }
    }
    if (best) best.members.push(k);
    else groups.push({ head: k, members: [k], urls, tok });
  }

  const prevById = new Map(ws.clusters.map((c) => [c.id, c]));
  const idOf = new Map<string, string>();
  const clusters = groups.map((g) => {
    const c = summarise(g.head, g.members, pageTypeFor(g.head, ws.seeds.locations), prevById.get(clusterId(g.head.term)), now);
    for (const m of g.members) idOf.set(m.term, c.id);
    return c;
  });
  const updated = new Map(withSerp.map((k) => [k.term, k]));
  return {
    workspace: {
      ...ws,
      keywords: ws.keywords.map((k) => ({ ...(updated.get(k.term) ?? k), clusterId: idOf.get(k.term) ?? null })),
      clusters: sortClusters(clusters),
      clusteredAt: now.toISOString(),
    },
    cost,
    errors,
    serps,
  };
}

/** Hand-set name, business value or ranking chance for one cluster (kept on re-runs). */
export function updateCluster(ws: KeywordWorkspace, id: string, patch: { name?: string; businessValue?: number; rankingChance?: number }): KeywordWorkspace {
  return {
    ...ws,
    clusters: sortClusters(
      ws.clusters.map((c) => {
        if (c.id !== id) return c;
        const businessValue = patch.businessValue ? clamp(patch.businessValue) : c.businessValue;
        const rankingChance = patch.rankingChance ? clamp(patch.rankingChance) : c.rankingChance;
        return {
          ...c,
          name: patch.name?.trim().slice(0, 80) || c.name,
          businessValue,
          rankingChance,
          scoresLocked: true,
          priority: businessValue * rankingChance,
          longTerm: !c.quickWin && rankingChance <= 2 && businessValue >= 4,
        };
      }),
    ),
  };
}
