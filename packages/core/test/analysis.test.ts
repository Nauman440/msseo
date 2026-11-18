import { describe, expect, it } from 'vitest';
import {
  analysisTargets, analysisToCsv, emptyKeywordWorkspace, emptyWorkspace, ruleRecommendations, runCompetitorAnalysis,
  type AnalysisDeps, type CompetitorRecord, type KeywordCluster, type KeywordRecord,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Module 6 · Deep competitor analysis, with fake services (no paid calls). */
const now = new Date('2026-11-17T10:00:00Z');
const rec = (domain: string, o: Partial<CompetitorRecord> = {}): CompetitorRecord => ({
  domain, name: null, type: 'direct', typeLocked: false, shortlist: 'direct', sources: ['serp'], seenIn: 2, avgPosition: 3, sharedKeywords: null, etv: 100, keywords: 50,
  trend: null, notes: null, isNew: false, firstSeenAt: '', refreshedAt: null, ...o,
});
const kw = (term: string, o: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['competitor'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '', ...o,
});
const cluster = (id: string, head: string, priority: number): KeywordCluster => ({
  id, name: head, head, size: 1, intent: 'commercial', pageType: 'service', volume: 500, businessValue: 4, rankingChance: 4, scoresLocked: false, priority,
  bestPosition: null, bestUrl: null, quickWin: false, longTerm: false, seasonalPeak: null, seasonalDeadline: null,
});
const page = (url: string, words: number, extra = '') =>
  parsePageContent(`<html><head>${extra}</head><body><main><h1>Title</h1><h2>Costs</h2><p>${'word '.repeat(words)}</p></main></body></html>`, url);

function setup() {
  const competitors = {
    ...emptyWorkspace('myhvac.com', { searches: ['ac repair dallas', 'furnace repair dallas'] }),
    own: { seenIn: 1, avgPosition: 9, rating: 4.2, reviews: 12, etv: 300, keywords: 80 },
    competitors: [
      rec('rival.com', { name: 'Rival Heating', rating: 4.8, reviews: 200 }),
      rec('big.com', { shortlist: 'aspirational', type: 'search' }),
      rec('nope.com', { shortlist: 'none', rejected: true }),
      rec('indeed.com', { shortlist: 'direct' }),
    ],
  };
  const keywords = {
    ...emptyKeywordWorkspace('myhvac.com'),
    clusters: [cluster('ac', 'ac repair dallas', 20)],
    keywords: [
      kw('ac repair dallas', { position: 12, serpUrls: ['https://rival.com/ac-repair/', 'https://www.myhvac.com/ac/', 'https://other.com/x'], sources: ['seed'] }),
      kw('emergency ac repair', { volume: 900, gapFrom: ['rival.com'] }),
      kw('heat pump cost', { volume: 300, gapFrom: ['big.com', 'stranger.com'] }),
      kw('stranger only', { volume: 5000, gapFrom: ['stranger.com'] }),
    ],
    prompts: [
      { id: 'a', text: 'Who is the best AC repair company in Dallas?', service: 'AC repair', location: 'Dallas' },
      { id: 'b', text: 'Not tracked', service: null, location: null, tracked: false },
    ],
  };
  const calls: string[] = [];
  const deps: AnalysisDeps = {
    dfs: {
      async serp(q) {
        calls.push(`serp:${q}`);
        return q === 'ac repair dallas'
          ? { cost: 0.002, entries: [
              { kind: 'local', domain: 'rival.com', url: null, title: 'Rival Heating', position: 1, rating: 4.8, reviews: 210, cid: '111' },
              { kind: 'local', domain: 'myhvac.com', url: null, title: 'MyHVAC', position: 3, rating: 4.3, reviews: 14, cid: '222' },
              { kind: 'organic', domain: 'www.rival.com', url: 'https://rival.com/', title: null, position: 2, rating: null, reviews: null, cid: null },
              { kind: 'organic', domain: 'myhvac.com', url: 'https://myhvac.com/', title: null, position: 7, rating: null, reviews: null, cid: null },
            ] }
          : { cost: 0.002, entries: [{ kind: 'organic', domain: 'big.com', url: 'https://big.com/', title: null, position: 1, rating: null, reviews: null, cid: null }] };
      },
      async businessInfo(k) {
        calls.push(`gbp:${k}`);
        return { cost: 0.0054, info: { title: k === 'cid:111' ? 'Rival Heating & Air' : 'MyHVAC', category: 'HVAC contractor', categories: [], rating: null, reviews: null, photos: 40, claimed: true } };
      },
      async chatGpt(q) {
        calls.push(`ai:${q}`);
        return { cost: 0.03, answer: { text: 'Top picks: Rival Heating and Big.com are popular choices.', citations: [{ url: 'https://www.yelp.com/biz/rival', title: 'Yelp' }, { url: 'https://rival.com/about', title: null }] } };
      },
    },
    async rank(d) {
      calls.push(`rank:${d}`);
      return { cost: 0.01, overview: { etv: d === 'myhvac.com' ? 350 : 1000, keywords: 90, top3: 5 } };
    },
    async pages(urls) {
      return urls.map((u) => (u.includes('rival.com/ac-repair') ? page(u, 1200, '<script type="application/ld+json">{"@type":"FAQPage"}</script>') : u.includes('myhvac.com/ac') ? page(u, 300) : page(u, 500, u.includes('rival') ? '<script type="application/ld+json">{"@type":"HVACBusiness"}</script>' : '')));
    },
    speed: async (u: string) => ({ score: u.includes('myhvac') ? 40 : 80, lcpMs: 3200, cls: 0.05, tbtMs: 300 }),
    sitemap: async (d: string) => ({ count: d === 'big.com' ? 900 : 40, folders: [{ folder: '/services/', count: 12 }] }),
    ai: null,
  };
  return { competitors, keywords, deps, calls };
}

describe('deep competitor analysis', () => {
  it('analyses the shortlist only (not rejected or hidden), direct first', () => {
    const { competitors } = setup();
    expect(analysisTargets(competitors).map((c) => c.domain)).toEqual(['rival.com', 'big.com']);
  });

  it('builds the comparison, grid, profiles, AI mentions, gaps and recommendations', async () => {
    const { competitors, keywords, deps, calls } = setup();
    const a = await runCompetitorAnalysis({ competitors, keywords, businessName: 'MyHVAC' }, deps, now);
    expect(a.sites.map((s) => [s.domain, s.role])).toEqual([['myhvac.com', 'you'], ['rival.com', 'direct'], ['big.com', 'aspirational']]);
    const [you, rival, big] = a.sites;
    expect(you).toMatchObject({ etv: 350, speed: 40, sitemapUrls: 40, mapIn: 1, organicIn: 1, avgOrganic: 7, avgMap: 3, rating: 4.3, reviews: 14, aiMentions: 0 });
    expect(rival).toMatchObject({ name: 'Rival Heating & Air', mapIn: 1, organicIn: 1, avgOrganic: 2, rating: 4.8, reviews: 210, aiMentions: 1, aiCited: 1, schema: ['HVACBusiness'] });
    expect(rival!.profile).toMatchObject({ category: 'HVAC contractor', photos: 40, claimed: true });
    expect(big).toMatchObject({ organicIn: 1, mapIn: 0, sitemapUrls: 900, aiMentions: 1 });
    expect(a.grid[0]!.cells['rival.com']).toEqual({ organic: 2, map: 1 });
    // Only the ticked question is asked; Yelp is a cited source.
    expect(calls.filter((c) => c.startsWith('ai:'))).toEqual(['ai:Who is the best AC repair company in Dallas?']);
    expect(a.ai!.sources.map((s) => s.domain)).toEqual(['yelp.com', 'rival.com']);
    // Business profiles by cid, for the businesses in the map pack.
    expect(calls.filter((c) => c.startsWith('gbp:')).sort()).toEqual(['gbp:cid:111', 'gbp:cid:222']);
    // Keyword gap: only searches a shortlisted competitor ranks for.
    expect(a.keywordGap.map((g) => [g.keyword, g.competitors])).toEqual([['emergency ac repair', ['rival.com']], ['heat pump cost', ['big.com']]]);
    // Content gap: the rival page that ranks for the top topic against ours.
    expect(a.contentGap).toHaveLength(1);
    expect(a.contentGap[0]).toMatchObject({ topic: 'ac repair dallas', yourPosition: null, you: { words: expect.any(Number) } });
    expect(a.contentGap[0]!.rivals[0]).toMatchObject({ domain: 'rival.com', faq: true });
    expect(a.contentGap[0]!.rivals[0]!.words).toBeGreaterThan(a.contentGap[0]!.you!.words);
    // No OpenAI: five recommendations from the numbers.
    expect(a.recommendationsBy).toBe('rules');
    expect(a.recommendations).toHaveLength(5);
    expect(a.recommendations.map((r) => r.title)).toContain('Get more Google reviews');
    expect(a.recommendations.map((r) => r.title)).toContain('Get recommended by AI assistants');
    expect(a.costUsd).toBeCloseTo(3 * 0.01 + 2 * 0.002 + 2 * 0.0054 + 0.03);
    expect(a.notes).toEqual([]);
  });

  it('keeps going when steps fail, and says what is missing', async () => {
    const { competitors, keywords, deps } = setup();
    const broken: AnalysisDeps = { ...deps, dfs: { ...deps.dfs, serp: async () => { throw new Error('boom'); }, chatGpt: async () => { throw new Error('402'); } } };
    const a = await runCompetitorAnalysis({ competitors, keywords: { ...keywords, prompts: [] } }, broken, now);
    expect(a.notes).toContain('2 of 2 searches could not be checked.');
    expect(a.notes.some((n) => n.startsWith('No AI questions are ticked'))).toBe(true);
    expect(a.ai).toBeNull();
    expect(a.recommendations.length).toBeGreaterThan(0);
    expect(ruleRecommendations(a).length).toBeLessThanOrEqual(5);
  });

  it('exports the gaps as CSV', async () => {
    const { competitors, keywords, deps } = setup();
    const a = await runCompetitorAnalysis({ competitors, keywords }, deps, now);
    expect(analysisToCsv(a, 'keywords')).toContain('emergency ac repair,900,20,commercial,rival.com');
    expect(analysisToCsv(a, 'content').split('\r\n')[0]).toContain('topic,searches_per_month');
  });
});
