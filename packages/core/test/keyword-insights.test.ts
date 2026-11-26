import { describe, expect, it } from 'vitest';
import {
  addLocalVolume, emptyKeywordWorkspace, focusPass, keywordInsights, keywordInsightsEnabled, keywordResearchSheets, matchAdsLocation, pageOneOf, whyText,
  type AdsLocation, type CompetitorWorkspace, type KeywordCluster, type KeywordRecord, type KeywordWorkspace, type LocalVolumeClient, type MappingWorkspace,
} from '../src';

/** Keyword insights (FEATURE_KEYWORD_INSIGHTS): local search volume, verdict and top moves, map results. */
const kw = (term: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'transactional', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['suggestion'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '', ...extra,
});
const cluster = (id: string, head: string, extra: Partial<KeywordCluster> = {}): KeywordCluster => ({
  id, name: head.charAt(0).toUpperCase() + head.slice(1), head, size: 2, intent: 'transactional', pageType: 'service', volume: 500, businessValue: 4, rankingChance: 3,
  scoresLocked: false, priority: 12, bestPosition: null, bestUrl: null, quickWin: false, longTerm: false, seasonalPeak: null, seasonalDeadline: null, ...extra,
});

const UK: AdsLocation[] = [
  { code: 1, name: 'Leeds,England,United Kingdom', type: 'City' },
  { code: 2, name: 'Leeds,Kent,England,United Kingdom', type: 'Neighborhood' },
  { code: 3, name: 'West Yorkshire,England,United Kingdom', type: 'County' },
  { code: 4, name: 'Bradford,England,United Kingdom', type: 'City' },
];

describe('local search volume', () => {
  it('finds the city for a place typed in the research inputs', () => {
    expect(matchAdsLocation(UK, 'Leeds')?.name).toBe('Leeds,England,United Kingdom');
    expect(matchAdsLocation(UK, ' west yorkshire ')?.name).toBe('West Yorkshire,England,United Kingdom');
    expect(matchAdsLocation(UK, 'Atlantis')).toBeNull();
  });

  it('measures up to 2 places, one paid task each, and reuses a recent measurement', async () => {
    const calls: string[] = [];
    const client = {
      locations: async () => UK,
      volume: async (terms: string[], loc: string) => {
        calls.push(loc);
        return { cost: 0.09, rows: terms.map((t) => ({ term: t, volume: t === 'plumber' ? 2400 : 30, cpc: 4 })) };
      },
    } as unknown as LocalVolumeClient;
    const ws = { ...emptyKeywordWorkspace('example.co.uk', { country: 'United Kingdom', language: 'en', seeds: { services: ['plumber'], locations: ['Leeds', 'Bradford', 'York'] } }) };
    const list = [kw('plumber', { volume: 90500 }), kw('plumber leeds')];
    const r = await addLocalVolume(client, ws, list, { now: new Date('2026-11-26T00:00:00Z') });
    expect(calls).toEqual(['Leeds,England,United Kingdom', 'Bradford,England,United Kingdom']);
    expect(r.cost).toBeCloseTo(0.18);
    expect(r.keywords[0]!.local).toEqual([{ place: 'Leeds', volume: 2400, cpc: 4 }, { place: 'Bradford', volume: 2400, cpc: 4 }]);
    // Measured yesterday and nothing new: no paid call.
    const again = await addLocalVolume(client, { ...ws, localPlaces: r.localPlaces }, r.keywords, { now: new Date('2026-11-27T00:00:00Z') });
    expect(calls).toHaveLength(2);
    expect(again.cost).toBe(0);
  });

  it('does nothing for an online shop', async () => {
    const client = { locations: async () => { throw new Error('should not be called'); } } as unknown as LocalVolumeClient;
    const ws = { ...emptyKeywordWorkspace('shop.com', { country: 'United Kingdom', language: 'en', businessType: 'shop', seeds: { services: ['bedding'], locations: ['Leeds'] } }) };
    const r = await addLocalVolume(client, ws, [kw('bedding')]);
    expect(r.calls).toBe(0);
  });

  it('keeps a broad search a local business can win when people nearby make it', () => {
    const ws = { seeds: { services: ['boiler repair'], locations: ['Leeds'], brands: [], extra: [] }, businessType: 'services' as const, siteWords: ['boiler', 'repair'] };
    const out = focusPass([kw('boiler repair company', { volume: 5000, difficulty: 25 }), kw('boiler repair service', { volume: 5000, difficulty: 25, local: [{ place: 'Leeds', volume: 110, cpc: 6 }] })], ws);
    expect(out.find((k) => k.term === 'boiler repair company')!).toMatchObject({ status: 'removed', removeReason: 'Too broad for a local business (no place in the search)' });
    expect(out.find((k) => k.term === 'boiler repair service')!.status).toBe('kept');
  });

  it('is switched on per server', () => {
    expect(keywordInsightsEnabled({ FEATURE_KEYWORD_INSIGHTS: '1' })).toBe(true);
    expect(keywordInsightsEnabled({})).toBe(false);
  });
});

describe('verdict and top moves', () => {
  const serp = (others: number, dirs: number, big: number, extra: string[] = []) => [
    ...extra,
    ...Array.from({ length: others }, (_, i) => `https://plumbing${i}.co.uk/`),
    ...Array.from({ length: dirs }, (_, i) => ['https://www.yell.com/x', 'https://www.checkatrade.com/y', 'https://www.yelp.com/z'][i % 3]!),
    ...Array.from({ length: big }, () => 'https://www.wikipedia.org/wiki/Plumber'),
  ];
  const ws: KeywordWorkspace = {
    ...emptyKeywordWorkspace('example.co.uk', { country: 'United Kingdom', language: 'en', seeds: { services: ['plumber'], locations: ['Leeds'] } }),
    localPlaces: [{ place: 'Leeds', locationName: 'Leeds,England,United Kingdom', at: '2026-11-26T00:00:00Z' }],
    keywords: [
      kw('boiler repair leeds', { clusterId: 'boiler', volume: 300, difficulty: 18, serpUrls: serp(7, 2, 1), serpFeatures: ['local_pack', 'people_also_ask'], local: [{ place: 'Leeds', volume: 260, cpc: 7 }] }),
      kw('boiler repair cost', { clusterId: 'boiler', volume: 90, local: [{ place: 'Leeds', volume: 40, cpc: 3 }] }),
      kw('blocked drain leeds', { clusterId: 'drain', volume: 900, difficulty: 55, position: 12, serpUrls: serp(2, 2, 5, ['https://example.co.uk/drains/']) }),
      kw('bathroom fitting leeds', { clusterId: 'bath', volume: 2000, difficulty: 70, serpUrls: serp(1, 2, 7) }),
    ],
    clusters: [
      cluster('boiler', 'boiler repair leeds', { volume: 390, rankingChance: 5, businessValue: 4 }),
      cluster('drain', 'blocked drain leeds', { volume: 900, rankingChance: 2, businessValue: 4, bestPosition: 12 }),
      cluster('bath', 'bathroom fitting leeds', { volume: 2000, rankingChance: 1, businessValue: 5 }),
    ],
  };
  const mapping = {
    domain: 'example.co.uk', builtAt: null, auditId: null, usedSearchConsole: false,
    rows: [
      { clusterId: 'boiler', topic: 'Boiler repair leeds', url: null, suggestedPath: '/services/boiler-repair/', primaryKeyword: 'boiler repair leeds', secondaryKeywords: ['boiler repair cost'], currentPosition: null, priority: 20, volume: 390, action: 'create', linksToAdd: [], schemaNeeded: [], conflicts: [], status: 'todo', drafts: { title: 'Boiler Repair in Leeds | Example', h1: '', meta: '', source: 'template', approved: false } },
      { clusterId: 'drain', topic: 'Blocked drain leeds', url: 'https://example.co.uk/drains/', suggestedPath: null, primaryKeyword: 'blocked drain leeds', secondaryKeywords: [], currentPosition: 12, priority: 8, volume: 900, action: 'optimise', linksToAdd: [], schemaNeeded: [], conflicts: [], status: 'todo', drafts: null },
      { clusterId: 'bath', topic: 'Bathroom fitting leeds', url: null, suggestedPath: null, primaryKeyword: 'bathroom fitting leeds', secondaryKeywords: [], currentPosition: null, priority: 5, volume: 2000, action: 'create', linksToAdd: [], schemaNeeded: [], conflicts: [], status: 'todo', drafts: null },
    ],
  } as unknown as MappingWorkspace;
  const competitors = {
    competitors: [
      { domain: 'abcplumbing.co.uk', name: 'ABC Plumbing', sources: ['local', 'serp'], seenIn: 4, type: 'direct' },
      { domain: 'yell.com', name: 'Yell', sources: ['local'], seenIn: 9, type: 'directory' },
      { domain: 'quickfix.co.uk', name: null, sources: ['local'], seenIn: 2, type: 'local' },
    ],
  } as unknown as CompetitorWorkspace;
  const insights = keywordInsights(ws, mapping, competitors)!;

  it('orders moves by how winnable they are, not by volume', () => {
    expect(insights.moves.map((m) => m.clusterId)).toEqual(['boiler', 'drain', 'bath']);
  });

  it('gives each move its demand, local demand, title, sections and why', () => {
    expect(insights.moves[0]).toMatchObject({
      url: null, newPath: '/services/boiler-repair/', demand: 390, localDemand: 300, localPlace: 'Leeds', difficulty: 18, title: 'Boiler Repair in Leeds | Example', sections: ['Boiler repair cost'],
    });
    expect(insights.moves[0]!.why).toContain('7 smaller sites');
    expect(insights.moves[0]!.why).toContain('plus map results');
    expect(insights.moves[1]!.why).toContain('You rank #12 now');
    expect(insights.moves[1]!.why).not.toContain('already');
    expect(whyText({ directories: 0, big: 0, others: 9, total: 10, youAt: 2, map: false }, null, null)).toContain('You are already #2');
  });

  it('writes a verdict and names the businesses in the map, without directories', () => {
    expect(insights.verdict).toContain('“Boiler repair leeds”');
    expect(insights.verdict).toContain('300 searches a month in Leeds');
    expect(insights.mapBusinesses).toEqual(['ABC Plumbing', 'quickfix.co.uk']);
  });

  it('reads who holds page one', () => {
    expect(pageOneOf(ws.keywords[0], 'example.co.uk')).toEqual({ directories: 2, big: 1, others: 7, total: 10, youAt: null, map: true });
    expect(whyText(null, null, null)).toBe('No Google results saved for this search yet.');
  });

  it('puts the verdict, moves and local column in the spreadsheet', () => {
    const sheets = keywordResearchSheets(ws, mapping, insights);
    const summary = sheets.find((s) => s.name === 'Summary')!;
    expect(summary.rows.some((r) => r[0] === 'Verdict')).toBe(true);
    expect(summary.rows.some((r) => r[0] === 'Move 1')).toBe(true);
    const keywords = sheets.find((s) => s.name === 'Keywords')!;
    expect(keywords.header.at(-1)).toBe('Searches a month in Leeds');
    // Without insights the spreadsheet is unchanged.
    expect(keywordResearchSheets(ws, mapping).find((s) => s.name === 'Keywords')!.header.at(-1)).toBe('Google page-1 features');
  });
});
