import { z } from 'zod';
import type { PageContent } from '../audit/page-content';
import { hiddenReason, normDomain, type CompetitorRecord, type CompetitorWorkspace } from '../competitors/competitors';
import type { KeywordWorkspace } from '../keywords/types';
import type { MappingWorkspace } from '../mapping/mapping';
import type { AnalysisClient, BusinessInfo, GridEntry } from '../providers/dataforseo-analysis';
import { COUNTRY_ISO } from '../providers/dataforseo-analysis';
import type { RankOverview } from '../providers/dataforseo-competitors';
import type { RankedKeyword } from '../providers/dataforseo-keywords';
import { cdnOf } from '../audit/rules-site';
import { answerFormat, missingEntities, missingTopics, pageDetails, topPagesFrom, type PageDetails, type TopPage } from './extras';
import type { OpenAiClient } from '../providers/openai';
import { siteQuestions } from '../actions/plan-guard';

/**
 * Module 6 · Deep competitor analysis (spec §16.2): the client's site against its shortlist.
 * 6.1 traffic, keywords, top-3 counts and a fresh ranking grid (organic + map pack) ·
 * 6.2 the pages that rank for the top topics, fetched and compared · 6.3 homepage speed, platform,
 * schema and sitemap size · 6.4 backlinks: not yet (Module 8) · 6.5 Business Profile and map-pack
 * positions · 6.6 the tracked AI questions asked in ChatGPT: who is mentioned and which sites are
 * cited · 6.7 keyword gap, content gap, comparison table and five recommendations.
 */
/** Older analyses (before 2026-11-18) only have url, words, headings, faq, lists and schema. */
export type PageStat = { url: string; words: number; headings: number; faq: boolean; lists: number; schema: string[] } & Partial<PageDetails>;
export type SiteRow = {
  domain: string;
  role: 'you' | 'direct' | 'aspirational';
  name: string | null;
  etv: number | null;
  keywords: number | null;
  top3: number | null;
  speed: number | null;
  platform: string | null;
  sitemapUrls: number | null;
  schema: string[];
  homeWords: number | null;
  organicIn: number;
  mapIn: number;
  avgOrganic: number | null;
  avgMap: number | null;
  rating: number | null;
  reviews: number | null;
  profile: BusinessInfo | null;
  aiMentions: number;
  aiCited: number;
  /**
   * Added 2026-11-18 (missing on older analyses): 6.1.1 12-month visits trend, 6.1.2 top-10 count,
   * 6.1.3 top pages, 6.3.1 lab vitals, 6.3.2 CDN and server, 6.3.3/6.3.4 sitemap folders, 6.3.5 mobile.
   */
  trend?: number[] | null;
  top10?: number | null;
  topPages?: TopPage[];
  lcpMs?: number | null;
  cls?: number | null;
  tbtMs?: number | null;
  cdn?: string | null;
  server?: string | null;
  folders?: { folder: string; count: number }[];
  mobileReady?: boolean | null;
  /** 6.3.4 About how many pages Google has indexed ("site:" search, an estimate; 2026-11-19 on). */
  indexed?: number | null;
};
/** 6.1.5 Searches the client ranks for and a direct competitor does not. */
export type WinRow = { keyword: string; volume: number | null; position: number | null; over: string[] };
/** 6.1.5 Searches both rank for and the client is higher (2026-11-19 on). */
export type AheadRow = { keyword: string; volume: number | null; position: number; behind: { domain: string; position: number }[] };
export type GridRow = { search: string; cells: Record<string, { organic: number | null; map: number | null }> };
export type GapRow = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; competitors: string[] };
export type ContentGapRow = { topic: string; volume: number; yourPosition: number | null; you: PageStat | null; rivals: (PageStat & { domain: string })[]; missing?: string[]; entities?: string[] };
export type AiRow = { prompt: string; mentioned: string[]; cited: string[]; format?: string; error?: string };
export type Recommendation = { title: string; why: string; steps: string[] };
export type CompetitorAnalysis = {
  domain: string;
  runAt: string;
  costUsd: number;
  tokens: number;
  sites: SiteRow[];
  searches: string[];
  grid: GridRow[];
  keywordGap: GapRow[];
  /** 6.1.5 (missing on older analyses). */
  wins?: WinRow[];
  /** 6.1.5 Searches you both rank for and you are higher. */
  ahead?: AheadRow[];
  contentGap: ContentGapRow[];
  ai: { rows: AiRow[]; sources: { domain: string; count: number }[]; formats?: { format: string; count: number }[] } | null;
  recommendations: Recommendation[];
  recommendationsBy: 'ai' | 'rules';
  /** Steps that could not run, in plain words. */
  notes: string[];
};

export const ANALYSIS_LIMITS = { competitors: 6, searches: 5, questions: 10, topics: 6, gap: 50, wins: 30, winRivals: 3 } as const;
/** Rough cost of one run (USD), used to stop before a spending cap is passed. */
export const ANALYSIS_ESTIMATE_USD = 0.9;

export type SpeedSummary = { score: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null };
export type AnalysisDeps = {
  dfs: Pick<AnalysisClient, 'serp' | 'businessInfo' | 'chatGpt'>;
  rank: (domain: string) => Promise<{ overview: RankOverview; cost: number }>;
  pages: (urls: string[]) => Promise<PageContent[]>;
  /** PageSpeed mobile: performance score (0–100) and lab vitals of a homepage; missing without a key. */
  speed?: (url: string) => Promise<SpeedSummary | null>;
  /** Pages in the sitemap and its biggest folders. */
  sitemap: (domain: string) => Promise<{ count: number; folders: { folder: string; count: number }[] } | null>;
  /** Homepage response headers (CDN, server). */
  headers?: (url: string) => Promise<Record<string, string> | null>;
  /** 6.1.3 Ranked keywords of a domain (grouped into its top pages). */
  ranked?: (domain: string) => Promise<{ keywords: RankedKeyword[]; cost: number }>;
  /** 6.1.5 Keywords `own` ranks for and `rival` does not. */
  wins?: (own: string, rival: string) => Promise<{ keywords: RankedKeyword[]; cost: number }>;
  /** 6.1.5 Searches both rank for, with both positions. */
  shared?: (own: string, rival: string) => Promise<{ rows: { term: string; volume: number | null; own: number | null; rival: number | null }[]; cost: number }>;
  /** 6.3.4 Indexed pages estimate ("site:" search). */
  indexed?: (domain: string) => Promise<{ count: number | null; cost: number }>;
  ai?: OpenAiClient | null;
};

/** The shortlist that is analysed: direct first, then aspirational (not rejected or hidden). */
export function analysisTargets(ws: CompetitorWorkspace): CompetitorRecord[] {
  return ws.competitors
    .filter((c) => c.shortlist !== 'none' && !c.rejected && !hiddenReason(c))
    .sort((a, b) => (a.shortlist === b.shortlist ? b.seenIn - a.seenIn : a.shortlist === 'direct' ? -1 : 1))
    .slice(0, ANALYSIS_LIMITS.competitors);
}

const hostOf = (url: string) => {
  try {
    return normDomain(new URL(url).hostname);
  } catch {
    return '';
  }
};
const belongs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const PLATFORMS = ['shopify', 'wix', 'squarespace', 'webflow', 'wordpress', 'nextjs', 'nuxt', 'gatsby'];
const PLATFORM_NAME: Record<string, string> = { shopify: 'Shopify', wix: 'Wix', squarespace: 'Squarespace', webflow: 'Webflow', wordpress: 'WordPress', nextjs: 'Next.js', nuxt: 'Nuxt', gatsby: 'Gatsby' };
const BUILDERS: Record<string, string> = { elementor: 'Elementor', divi: 'Divi', wpbakery: 'WPBakery' };
function platformOf(p: PageContent | undefined): string | null {
  if (!p) return null;
  const base = PLATFORMS.find((x) => p.hints.includes(x));
  const builder = Object.keys(BUILDERS).find((x) => p.hints.includes(x));
  return base ? `${PLATFORM_NAME[base]}${builder ? ` + ${BUILDERS[builder]}` : ''}` : builder ? BUILDERS[builder]! : null;
}
const stat = (p: PageContent, now: Date): PageStat => ({
  url: p.url,
  words: p.words,
  headings: p.headings.filter((h) => h.level === 2 || h.level === 3).length,
  faq: p.faqMarkup || p.schemaTypes.includes('FAQPage'),
  lists: p.lists + p.tables,
  schema: p.schemaTypes.slice(0, 8),
  ...pageDetails(p, now),
});

async function pool<T>(items: T[], limit: number, fn: (t: T, i: number) => Promise<void>) {
  const queue = items.map((t, i) => [t, i] as const);
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await fn(next[0], next[1]);
  }));
}

/** Words that identify a site in an AI answer: the domain, its name part, and the business name. */
function mentionTerms(domain: string, name: string | null): string[] {
  const root = domain.split('.')[0]!;
  const terms = [domain, root.length >= 5 ? root.replace(/-/g, ' ') : '', root.length >= 5 ? root : '', name && name.length >= 4 ? name : ''];
  return [...new Set(terms.map((t) => t.toLowerCase().trim()).filter(Boolean))];
}

export async function runCompetitorAnalysis(
  input: { competitors: CompetitorWorkspace; keywords: KeywordWorkspace; mapping?: MappingWorkspace | null; businessName?: string | null },
  deps: AnalysisDeps,
  now = new Date(),
): Promise<CompetitorAnalysis> {
  const ws = input.competitors;
  const kw = input.keywords;
  const domain = ws.domain;
  const locale = { country: ws.country, language: ws.language };
  const targets = analysisTargets(ws);
  const names = new Map<string, string | null>([[domain, input.businessName ?? null], ...targets.map((c) => [c.domain, c.name] as [string, string | null])]);
  const domains = [domain, ...targets.map((c) => c.domain)];
  const searches = ws.searches.slice(0, ANALYSIS_LIMITS.searches);
  const questions = siteQuestions(kw, ANALYSIS_LIMITS.questions).questions;
  const notes: string[] = [];
  let cost = 0;
  const owner = (host: string) => domains.find((d) => belongs(host, d)) ?? null;

  // 6.1 traffic and keywords · 6.3 homepage, speed, sitemap · 6.1/6.5 grid · 6.6 ChatGPT, all at once.
  const rank = new Map<string, RankOverview>();
  const speed = new Map<string, SpeedSummary | null>();
  const sitemap = new Map<string, { count: number; folders: { folder: string; count: number }[] } | null>();
  const headers = new Map<string, Record<string, string> | null>();
  const topPages = new Map<string, TopPage[]>();
  const winsBy = new Map<string, RankedKeyword[]>();
  const sharedBy = new Map<string, { term: string; volume: number | null; own: number | null; rival: number | null }[]>();
  const indexed = new Map<string, number | null>();
  const grid: GridRow[] = searches.map((s) => ({ search: s, cells: {} }));
  const cids = new Map<string, string>();
  const mapRatings = new Map<string, { rating: number | null; reviews: number | null }>();
  const aiRows: AiRow[] = [];
  const failed = { rank: 0, serp: 0, ai: 0, pages: 0, wins: 0 };

  const [homes] = await Promise.all([
    deps.pages(domains.map((d) => `https://${d}/`)).catch(() => [] as PageContent[]),
    pool(domains, 4, async (d) => {
      try {
        const r = await deps.rank(d);
        cost += r.cost;
        rank.set(d, r.overview);
      } catch {
        failed.rank++;
      }
    }),
    pool(domains, 4, async (d) => {
      speed.set(d, deps.speed ? await deps.speed(`https://${d}/`).catch(() => null) : null);
      sitemap.set(d, await deps.sitemap(d).catch(() => null));
      headers.set(d, deps.headers ? await deps.headers(`https://${d}/`).catch(() => null) : null);
    }),
    // 6.1.3 the competitors' strongest pages · 6.1.5 what the client ranks for and the direct competitors do not.
    pool(deps.ranked ? targets.map((t) => t.domain) : [], 3, async (d) => {
      try {
        const r = await deps.ranked!(d);
        cost += r.cost;
        topPages.set(d, topPagesFrom(r.keywords));
      } catch {
        failed.pages++;
      }
    }),
    pool(deps.wins ? targets.slice(0, ANALYSIS_LIMITS.winRivals).map((t) => t.domain) : [], 3, async (d) => {
      try {
        const r = await deps.wins!(domain, d);
        cost += r.cost;
        winsBy.set(d, r.keywords);
      } catch {
        failed.wins++;
      }
    }),
    pool(deps.shared ? targets.slice(0, ANALYSIS_LIMITS.winRivals).map((t) => t.domain) : [], 3, async (d) => {
      try {
        const r = await deps.shared!(domain, d);
        cost += r.cost;
        sharedBy.set(d, r.rows);
      } catch {
        failed.wins++;
      }
    }),
    pool(deps.indexed ? domains : [], 4, async (d) => {
      try {
        const r = await deps.indexed!(d);
        cost += r.cost;
        indexed.set(d, r.count);
      } catch {
        indexed.set(d, null);
      }
    }),
    pool(searches, 5, async (s, i) => {
      try {
        const r = await deps.dfs.serp(s, locale);
        cost += r.cost;
        for (const e of r.entries as GridEntry[]) {
          const d = owner(normDomain(e.domain));
          if (!d) continue;
          const cell = (grid[i]!.cells[d] ??= { organic: null, map: null });
          if (e.kind === 'organic' && cell.organic === null) cell.organic = e.position;
          if (e.kind === 'local' && cell.map === null) {
            cell.map = e.position;
            if (e.cid && !cids.has(d)) cids.set(d, e.cid);
            if (e.rating !== null) mapRatings.set(d, { rating: e.rating, reviews: e.reviews });
          }
        }
      } catch {
        failed.serp++;
      }
    }),
    pool(questions, 5, async (q) => {
      try {
        const r = await deps.dfs.chatGpt(q, COUNTRY_ISO[ws.country]);
        cost += r.cost;
        const text = r.answer.text.toLowerCase();
        const citedHosts = r.answer.citations.map((c) => hostOf(c.url)).filter(Boolean);
        aiRows.push({
          prompt: q,
          format: answerFormat(r.answer.text),
          mentioned: domains.filter((d) => mentionTerms(d, names.get(d) ?? null).some((t) => text.includes(t))),
          cited: [...new Set(citedHosts)],
        });
      } catch (err) {
        failed.ai++;
        aiRows.push({ prompt: q, mentioned: [], cited: [], error: err instanceof Error ? err.message : String(err) });
      }
    }),
  ]);
  if (failed.rank) notes.push(`Traffic estimates could not be read for ${failed.rank} ${failed.rank === 1 ? 'site' : 'sites'}.`);
  if (failed.serp) notes.push(`${failed.serp} of ${searches.length} searches could not be checked.`);
  if (failed.ai) notes.push(`${failed.ai} of ${questions.length} ChatGPT questions did not get an answer.`);
  if (failed.pages) notes.push(`Top pages could not be read for ${failed.pages} ${failed.pages === 1 ? 'competitor' : 'competitors'}.`);
  if (failed.wins) notes.push(`Searches where you beat them could not be read for ${failed.wins} ${failed.wins === 1 ? 'competitor' : 'competitors'}.`);
  if (!questions.length) notes.push('No AI questions are ticked (Keywords → Questions for AI), so ChatGPT was not asked.');

  // 6.5 Business Profiles of the businesses seen in the map pack.
  const profiles = new Map<string, BusinessInfo | null>();
  await pool([...cids], 4, async ([d, cid]) => {
    try {
      const r = await deps.dfs.businessInfo(`cid:${cid}`, locale);
      cost += r.cost;
      profiles.set(d, r.info);
    } catch {
      profiles.set(d, null);
    }
  });

  // 6.2 Pages that rank for the top topics (cached top-10 results from keyword research), fetched and compared.
  const byTerm = new Map(kw.keywords.map((k) => [k.term, k]));
  const topics = [...kw.clusters].sort((a, b) => b.priority - a.priority).slice(0, 20);
  const plan = new Map((input.mapping?.rows ?? []).map((r) => [r.clusterId, r.url]));
  const wanted: { topic: string; volume: number; yourPosition: number | null; yourUrl: string | null; rivalUrls: string[] }[] = [];
  for (const c of topics) {
    if (wanted.length >= ANALYSIS_LIMITS.topics) break;
    const urls = byTerm.get(c.head)?.serpUrls ?? [];
    const rivalUrls = urls.filter((u) => {
      const d = owner(hostOf(u));
      return d && d !== domain;
    }).slice(0, 3);
    if (!rivalUrls.length) continue;
    const yourUrl = urls.find((u) => belongs(hostOf(u), domain)) ?? plan.get(c.id) ?? c.bestUrl ?? null;
    wanted.push({ topic: c.name, volume: c.volume, yourPosition: c.bestPosition, yourUrl, rivalUrls });
  }
  const pageUrls = [...new Set(wanted.flatMap((w) => [...w.rivalUrls, ...(w.yourUrl ? [w.yourUrl] : [])]))].slice(0, 24);
  const fetched = pageUrls.length ? await deps.pages(pageUrls).catch(() => [] as PageContent[]) : [];
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '');
  const pageFor = (u: string) => fetched.find((p) => norm(p.url) === norm(u));
  const contentGap: ContentGapRow[] = wanted.map((w) => {
    const you = w.yourUrl ? pageFor(w.yourUrl) : undefined;
    return {
      topic: w.topic,
      volume: w.volume,
      yourPosition: w.yourPosition,
      you: you ? stat(you, now) : null,
      rivals: w.rivalUrls.flatMap((u) => {
        const p = pageFor(u);
        return p ? [{ ...stat(p, now), domain: owner(hostOf(u))! }] : [];
      }),
      missing: missingTopics(you ?? null, w.rivalUrls.flatMap((u) => pageFor(u) ?? [])),
      entities: missingEntities(you ?? null, w.rivalUrls.flatMap((u) => pageFor(u) ?? []), targets.flatMap((t) => [t.domain.split('.')[0]!, t.name ?? ''])),
    };
  });
  if (!kw.clusters.length) notes.push('Research keywords first: the content comparison uses your keyword topics.');

  // 6.7 Keyword gap: kept searches the shortlist ranks for and the site does not.
  const shortlisted = new Set(targets.map((c) => c.domain));
  const keywordGap: GapRow[] = kw.keywords
    .filter((k) => k.status === 'kept' && k.position === null && (k.gapFrom?.some((d) => shortlisted.has(d)) ?? false))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, ANALYSIS_LIMITS.gap)
    .map((k) => ({ keyword: k.term, volume: k.volume, difficulty: k.difficulty, intent: k.intent, competitors: (k.gapFrom ?? []).filter((d) => shortlisted.has(d)) }));

  const sources = new Map<string, number>();
  for (const r of aiRows) for (const h of r.cited) sources.set(h, (sources.get(h) ?? 0) + 1);

  const homeOf = (d: string) => homes.find((p) => belongs(hostOf(p.url), d));
  const sites: SiteRow[] = domains.map((d) => {
    const t = targets.find((c) => c.domain === d);
    const cells = grid.map((g) => g.cells[d]).filter((c): c is { organic: number | null; map: number | null } => Boolean(c));
    const home = homeOf(d);
    const profile = profiles.get(d) ?? null;
    const map = mapRatings.get(d);
    return {
      domain: d,
      role: d === domain ? 'you' : t!.shortlist === 'direct' ? 'direct' : 'aspirational',
      name: profile?.title ?? names.get(d) ?? null,
      etv: rank.get(d)?.etv ?? (d === domain ? ws.own?.etv ?? null : t?.etv ?? null),
      keywords: rank.get(d)?.keywords ?? (d === domain ? ws.own?.keywords ?? null : t?.keywords ?? null),
      top3: rank.get(d)?.top3 ?? null,
      speed: speed.get(d)?.score ?? null,
      platform: platformOf(home),
      sitemapUrls: sitemap.get(d)?.count ?? null,
      trend: d === domain ? null : t?.trend?.map((p) => p.etv) ?? null,
      top10: rank.get(d)?.top10 ?? null,
      topPages: topPages.get(d) ?? [],
      lcpMs: speed.get(d)?.lcpMs ?? null,
      cls: speed.get(d)?.cls ?? null,
      tbtMs: speed.get(d)?.tbtMs ?? null,
      cdn: headers.get(d) ? cdnOf(headers.get(d)!) ?? null : null,
      server: headers.get(d)?.server ?? null,
      folders: sitemap.get(d)?.folders ?? [],
      indexed: indexed.has(d) ? indexed.get(d)! : undefined,
      mobileReady: home ? home.viewport && !home.zoomBlocked : null,
      schema: home?.schemaTypes.slice(0, 8) ?? [],
      homeWords: home?.words ?? null,
      organicIn: cells.filter((c) => c.organic !== null).length,
      mapIn: cells.filter((c) => c.map !== null).length,
      avgOrganic: avg(cells.flatMap((c) => (c.organic === null ? [] : [c.organic]))),
      avgMap: avg(cells.flatMap((c) => (c.map === null ? [] : [c.map]))),
      rating: profile?.rating ?? map?.rating ?? (d === domain ? ws.own?.rating ?? null : t?.rating ?? null),
      reviews: profile?.reviews ?? map?.reviews ?? (d === domain ? ws.own?.reviews ?? null : t?.reviews ?? null),
      profile,
      aiMentions: aiRows.filter((r) => r.mentioned.includes(d)).length,
      aiCited: aiRows.filter((r) => r.cited.some((h) => belongs(h, d))).length,
    };
  });

  const result: CompetitorAnalysis = {
    domain,
    runAt: now.toISOString(),
    costUsd: Math.round(cost * 10_000) / 10_000,
    tokens: 0,
    sites,
    searches,
    grid,
    keywordGap,
    wins: winRows(winsBy),
    ahead: aheadRows(sharedBy),
    contentGap,
    ai: questions.length ? { rows: aiRows.sort((a, b) => questions.indexOf(a.prompt) - questions.indexOf(b.prompt)), sources: [...sources].map(([d, count]) => ({ domain: d, count })).sort((a, b) => b.count - a.count).slice(0, 12), formats: formatCounts(aiRows) } : null,
    recommendations: [],
    recommendationsBy: 'rules',
    notes,
  };
  const rules = ruleRecommendations(result);
  if (deps.ai) {
    try {
      const r = await aiRecommendations(deps.ai, result, kw.businessType === 'shop' ? 'online shop' : 'local service business');
      return { ...result, recommendations: r.recommendations, recommendationsBy: 'ai', tokens: r.tokens };
    } catch {
      notes.push('AI recommendations could not be written; these come from the numbers directly.');
    }
  }
  return { ...result, recommendations: rules };
}

/** 6.1.5 Searches the client ranks for and a direct competitor does not, most searched first. */
function winRows(by: Map<string, RankedKeyword[]>): WinRow[] {
  const rows = new Map<string, WinRow>();
  for (const [rival, list] of by) {
    for (const k of list) {
      const r = rows.get(k.term) ?? { keyword: k.term, volume: k.volume, position: k.position, over: [] };
      r.over.push(rival);
      rows.set(k.term, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.over.length - a.over.length || (b.volume ?? 0) - (a.volume ?? 0)).slice(0, ANALYSIS_LIMITS.wins);
}

/** 6.1.5 Searches both rank for where the client is higher than one or more direct competitors. */
export function aheadRows(by: Map<string, { term: string; volume: number | null; own: number | null; rival: number | null }[]>): AheadRow[] {
  const rows = new Map<string, AheadRow>();
  for (const [rival, list] of by) {
    for (const k of list) {
      if (k.own === null || k.rival === null || k.own >= k.rival) continue;
      const r = rows.get(k.term) ?? { keyword: k.term, volume: k.volume, position: k.own, behind: [] };
      r.behind.push({ domain: rival, position: k.rival });
      rows.set(k.term, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.behind.length - a.behind.length || (b.volume ?? 0) - (a.volume ?? 0)).slice(0, ANALYSIS_LIMITS.wins);
}

/** 6.6.3 How ChatGPT shaped its answers (lists, steps, tables, prose). */
function formatCounts(rows: AiRow[]): { format: string; count: number }[] {
  const c = new Map<string, number>();
  for (const r of rows) if (r.format) c.set(r.format, (c.get(r.format) ?? 0) + 1);
  return [...c].map(([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : null;
};

/** 6.7 Five recommendations straight from the numbers (also the fallback when OpenAI is not available). */
export function ruleRecommendations(a: CompetitorAnalysis): Recommendation[] {
  const you = a.sites.find((s) => s.role === 'you')!;
  const rivals = a.sites.filter((s) => s.role !== 'you');
  const out: { score: number; rec: Recommendation }[] = [];
  const rivalReviews = median(rivals.flatMap((r) => (r.reviews === null ? [] : [r.reviews])));
  if (rivalReviews !== null && (you.reviews ?? 0) < rivalReviews) {
    out.push({ score: 9, rec: { title: 'Get more Google reviews', why: `Your competitors have about ${rivalReviews} reviews on Google; you have ${you.reviews ?? 'none we could find'}. Reviews decide who gets the call in the map results.`, steps: ['Ask every happy customer for a review with a short link, the same day.', 'Reply to every review, good or bad.', 'Aim to pass the competitors’ count within a few months.'] } });
  }
  const bestMap = Math.max(0, ...rivals.map((r) => r.mapIn));
  if (a.searches.length && you.mapIn < bestMap) {
    out.push({ score: 8, rec: { title: 'Show up in the map results more often', why: `A competitor is in the map pack for ${bestMap} of ${a.searches.length} searches; you are in ${you.mapIn}.`, steps: ['Complete your Google Business Profile: main and extra categories, services, hours, photos.', 'Use the same business name, address and phone everywhere.', 'Post updates and photos every week.'] } });
  }
  if (a.keywordGap.length) {
    const top = a.keywordGap.slice(0, 3).map((g) => `“${g.keyword}”`).join(', ');
    out.push({ score: 7 + Math.min(2, a.keywordGap.length / 25), rec: { title: 'Target the searches your competitors win', why: `Your competitors rank for ${a.keywordGap.length} searches you do not, such as ${top}.`, steps: ['Check the page plan for each topic: create the missing pages first.', 'Use the search in the title, main heading and first paragraph.', 'Link to the new pages from your homepage and service pages.'] } });
  }
  const thin = a.contentGap.filter((c) => {
    const rivalWords = median(c.rivals.map((r) => r.words));
    return rivalWords !== null && (!c.you || c.you.words < rivalWords * 0.7);
  });
  if (thin.length) {
    out.push({ score: 7, rec: { title: 'Make your key pages as complete as the ones that rank', why: `For ${thin.length} of your top topics the competitor pages that rank are longer or cover more than yours (or you have no page), for example “${thin[0]!.topic}”.`, steps: ['Cover what the top pages cover: costs, options, process, areas served.', 'Add an FAQ section with the questions people ask.', 'Add lists or a table so the page is easy to scan.'] } });
  }
  const rivalSpeed = median(rivals.flatMap((r) => (r.speed === null ? [] : [r.speed])));
  if (rivalSpeed !== null && you.speed !== null && you.speed < rivalSpeed - 10) {
    out.push({ score: 6, rec: { title: 'Speed up your site on phones', why: `Your homepage scores ${you.speed}/100 on mobile speed; the competitors’ middle score is ${rivalSpeed}.`, steps: ['Compress and resize images, and use WebP.', 'Remove plugins and scripts you do not need.', 'Use caching and a CDN.'] } });
  }
  if (a.ai && a.ai.rows.length) {
    const mentioned = rivals.filter((r) => r.aiMentions > 0);
    if (you.aiMentions < Math.max(0, ...rivals.map((r) => r.aiMentions))) {
      out.push({ score: 6.5, rec: { title: 'Get recommended by AI assistants', why: `ChatGPT mentioned you in ${you.aiMentions} of ${a.ai.rows.length} questions${mentioned.length ? `, and ${mentioned[0]!.domain} in ${mentioned[0]!.aiMentions}` : ''}.`, steps: ['Be listed, with the same details, on the sites ChatGPT cites (see “Sources ChatGPT cites”).', 'Answer common questions directly on your pages.', 'Keep your business name, services and areas consistent everywhere.'] } });
    }
  }
  const business = (s: SiteRow) => s.schema.some((t) => /LocalBusiness|Organization|HVACBusiness|Plumber|Electrician|RoofingContractor|HomeAndConstructionBusiness|Store/i.test(t));
  if (!business(you) && rivals.some(business)) {
    out.push({ score: 5, rec: { title: 'Add business details for search engines (schema)', why: 'Competitors describe their business in structured data on their homepage; you do not.', steps: ['Add LocalBusiness (or Organization) schema with name, address, phone, hours and areas served.', 'Check it with Google’s Rich Results Test.'] } });
  }
  if (out.length < 5) {
    out.push({ score: 1, rec: { title: 'Check your competitors again next quarter', why: 'Positions, reviews and AI answers change. Comparing again shows whether the work is paying off.', steps: ['Keep the shortlist up to date.', 'Run this analysis again in about three months.'] } });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 5).map((x) => x.rec);
}

const recSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendations'],
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'steps'],
        properties: { title: { type: 'string' }, why: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};
const recParse = z.object({ recommendations: z.array(z.object({ title: z.string(), why: z.string(), steps: z.array(z.string()) })) });

/** 6.7 Five recommendations by OpenAI, grounded in the numbers only (no Search Console data is sent). */
async function aiRecommendations(ai: OpenAiClient, a: CompetitorAnalysis, kind: string): Promise<{ recommendations: Recommendation[]; tokens: number }> {
  const facts = {
    sites: a.sites.map((s) => ({ site: s.role === 'you' ? `YOU (${s.domain})` : s.domain, role: s.role, visitsPerMonth: s.etv, keywords: s.keywords, top3: s.top3, mobileSpeed: s.speed, platform: s.platform, pagesInSitemap: s.sitemapUrls, homepageSchema: s.schema, mapPackIn: `${s.mapIn}/${a.searches.length}`, resultsIn: `${s.organicIn}/${a.searches.length}`, rating: s.rating, reviews: s.reviews, profileCategory: s.profile?.category ?? null, profilePhotos: s.profile?.photos ?? null, chatGptMentions: a.ai ? `${s.aiMentions}/${a.ai.rows.length}` : null })),
    searches: a.searches,
    keywordGapTop: a.keywordGap.slice(0, 15).map((g) => ({ keyword: g.keyword, volume: g.volume })),
    contentGap: a.contentGap.map((c) => ({ topic: c.topic, yourPosition: c.yourPosition, yourWords: c.you?.words ?? null, yourFaq: c.you?.faq ?? null, rivalWords: c.rivals.map((r) => r.words), rivalFaq: c.rivals.some((r) => r.faq) })),
    chatGptCites: a.ai?.sources.slice(0, 8) ?? [],
  };
  const r = await ai.generateJson({
    name: 'competitor_recommendations',
    system:
      `You are an SEO consultant writing for the owner of a ${kind}. Write exactly five recommendations to beat the competitors, most valuable first. ` +
      'Base every recommendation on the numbers given and quote the relevant numbers in "why". Plain English, no jargon, no promises of rankings. ' +
      'Each: a short title (under 70 characters), why (one or two sentences), and 2–4 concrete steps.',
    user: JSON.stringify(facts),
    jsonSchema: recSchema,
    parse: recParse,
    maxOutputTokens: 2000,
    timeoutMs: 60_000,
  });
  if (r.data.recommendations.length < 3) throw new Error('too few recommendations');
  return { recommendations: r.data.recommendations.slice(0, 5).map((x) => ({ title: x.title.slice(0, 120), why: x.why.slice(0, 600), steps: x.steps.slice(0, 5).map((s) => s.slice(0, 300)) })), tokens: r.tokens };
}

/** CSV export of the keyword gap or the content gap. */
export function analysisToCsv(a: CompetitorAnalysis, list: 'keywords' | 'content'): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: (string | number | null)[][] =
    list === 'keywords'
      ? [['keyword', 'searches_per_month', 'difficulty', 'intent', 'competitors'], ...a.keywordGap.map((g) => [g.keyword, g.volume, g.difficulty, g.intent, g.competitors.join(' ')])]
      : [
          ['topic', 'searches_per_month', 'your_position', 'your_page', 'your_words', 'competitor', 'competitor_page', 'competitor_words', 'competitor_faq'],
          ...a.contentGap.flatMap((c) => c.rivals.map((r) => [c.topic, c.volume, c.yourPosition, c.you?.url ?? '', c.you?.words ?? null, r.domain, r.url, r.words, r.faq ? 'yes' : 'no'])),
        ];
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
