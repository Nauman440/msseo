import { describe, expect, it } from 'vitest';
import {
  addKeywords, buildSeeds, cleanKeywords, clusterKeywords, competitorSearchesFromClusters, dedupeKey, emptyKeywordWorkspace, generatePrompts, keywordsToCsv,
  parseKeywordCsv, removalReason, researchKeywords, seasonality, setKeywordStatus, templatePrompts, updateCluster,
  type KeywordClient, type KeywordMetrics, type KeywordRecord, type OpenAiClient,
} from '../src';

const m = (term: string, volume: number | null, extra: Partial<KeywordMetrics> = {}): KeywordMetrics => ({
  term, volume, trend: null, trendFrom: null, difficulty: 20, cpc: 12, intent: 'commercial', ...extra,
});

function fake(over: Partial<Record<keyof KeywordClient, unknown>> = {}) {
  const calls: string[] = [];
  const client = {
    async rankedKeywords(target: string) {
      calls.push(`ranked:${target}`);
      if (target === 'myhvac.com') return { cost: 0.012, keywords: [{ ...m('ac repair dallas', 1000), position: 7, url: 'https://myhvac.com/ac-repair' }] };
      return { cost: 0.012, keywords: [{ ...m('rival hvac reviews', 300), position: 1, url: null }, { ...m('furnace repair dallas', 800), position: 2, url: null }] };
    },
    async overview(terms: string[]) {
      calls.push(`overview:${terms.length}`);
      return { cost: 0.012, keywords: terms.filter((t) => !t.includes('zzz')).map((t) => m(t, t.includes('near me') ? 2000 : 100)) };
    },
    async suggestions(k: string) {
      calls.push(`sugg:${k}`);
      return { cost: 0.012, keywords: [m(`${k} jobs`, 500), m(`${k} houston`, 900), m(`diy ${k}`, 50), m(`free ${k}`, 40), m(`${k} free estimate`, 30)] };
    },
    async autocomplete(k: string) {
      calls.push(`auto:${k}`);
      return { cost: 0.002, suggestions: [`${k} zzz odd phrasing`] };
    },
    async serpUrls(k: string) {
      calls.push(`serp:${k}`);
      const shared = ['https://a.com/ac', 'https://b.com/ac', 'https://c.com/ac'];
      return { cost: 0.002, urls: k.includes('furnace') ? ['https://x.com/f', 'https://y.com/f', 'https://z.com/f'] : shared };
    },
    ...over,
  } as unknown as KeywordClient;
  return { client, calls };
}

const rec = (term: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['seed'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '2026-11-01T00:00:00.000Z', ...extra,
});

describe('keyword research', () => {
  it('builds seeds from services, places, brands and HVAC symptoms', () => {
    const seeds = buildSeeds({ services: ['AC Repair'], locations: ['Dallas'], brands: ['Trane'], extra: ['ductless mini split'] });
    expect(seeds).toEqual(expect.arrayContaining(['ac repair', 'ac repair near me', 'emergency ac repair', 'ac repair dallas', 'best ac repair dallas', 'trane ac repair', 'ac not cooling', 'ductless mini split']));
    expect(buildSeeds({ services: ['Plumbing'], locations: [], brands: [], extra: [] })).not.toContain('ac not cooling');
  });

  it('cleaning rules: jobs, free, DIY, other cities and rival brands; keeps free estimates', () => {
    const ctx = { locations: ['Dallas, TX'], brands: ['Trane'], competitorStems: ['coolray'] };
    expect(removalReason('hvac technician jobs dallas', ctx)).toBe('Job or training search');
    expect(removalReason('free ac repair', ctx)).toBe('Looking for something free');
    expect(removalReason('ac repair free estimate', ctx)).toBeNull();
    expect(removalReason('how to fix ac capacitor', ctx)).toBe('Do-it-yourself search');
    expect(removalReason('ac repair houston', ctx)).toBe('Another location (houston)');
    expect(removalReason('ac repair dallas', ctx)).toBeNull();
    expect(removalReason('cool ray heating reviews', ctx)).toBe('Competitor brand (coolray)');
    expect(removalReason('trane ac repair', ctx)).toBeNull();
  });

  it('merges near-duplicates into the most searched spelling and respects hand-made choices', () => {
    expect(dedupeKey('AC repairs in Dallas')).toBe(dedupeKey('dallas ac repair'));
    const ws = { ...emptyKeywordWorkspace('myhvac.com'), keywords: [rec('dallas ac repair', { volume: 50 }), rec('ac repairs in dallas', { volume: 900 }), rec('ac jobs', { statusLocked: true })] };
    const out = cleanKeywords(ws);
    const by = Object.fromEntries(out.keywords.map((k) => [k.term, k]));
    expect(by['ac repairs in dallas']?.status).toBe('kept');
    expect(by['dallas ac repair']).toMatchObject({ status: 'removed', removeReason: 'Same search as "ac repairs in dallas"' });
    expect(by['ac jobs']?.status).toBe('kept'); // locked by hand
  });

  it('removes off-topic and vehicle searches, and Google close variants with the same volume and trend', () => {
    const trend = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ws = {
      ...emptyKeywordWorkspace('myhvac.com', { seeds: { services: ['AC repair'] } }),
      keywords: [
        rec('plumber', { sources: ['ranked'] }),
        rec('hvac near me', { sources: ['ranked'] }),
        rec('plumber', { sources: ['seed'] }),
        rec('car ac repair', { sources: ['suggestion'] }),
        rec('air cond repair', { volume: 368000, trend, sources: ['ranked'], position: 3 }),
        rec('aircon ac repair', { volume: 368000, trend, sources: ['suggestion'] }),
        rec('ac ac repair', { volume: 50, sources: ['suggestion'] }),
        rec('ac repair', { volume: 900, sources: ['seed'] }),
      ],
    };
    const by = Object.fromEntries(cleanKeywords(ws).keywords.map((k) => [k.term + ':' + k.sources[0], k]));
    expect(by['plumber:ranked']?.removeReason).toBe('Not about your services');
    expect(by['plumber:seed']?.status).toBe('kept'); // typed in: always on topic
    expect(by['hvac near me:ranked']?.status).toBe('kept'); // synonym of ac
    expect(by['car ac repair:suggestion']?.removeReason).toBe('Vehicle search');
    expect(by['air cond repair:ranked']?.status).toBe('kept');
    expect(by['aircon ac repair:suggestion']?.removeReason).toBe('Same search as "air cond repair"');
    expect(by['ac ac repair:suggestion']?.removeReason).toBe('Same search as "ac repair"');
  });

  it('collects every source, fills metrics, cleans, and keeps zero-volume terms', async () => {
    const { client, calls } = fake();
    const ws = emptyKeywordWorkspace('www.myhvac.com', { seeds: { services: ['ac repair'], locations: ['Dallas'] } });
    const r = await researchKeywords(client, ws, {
      competitors: ['rival-hvac.com'],
      gsc: [{ query: 'Dallas AC Repair Company', clicks: 4, impressions: 300, position: 6.2 }],
    });
    expect(r.errors).toEqual([]);
    expect(calls).toEqual(expect.arrayContaining(['ranked:myhvac.com', 'ranked:rival-hvac.com', 'sugg:ac repair', 'auto:ac repair dallas']));
    const by = Object.fromEntries(r.workspace.keywords.map((k) => [k.term, k]));
    expect(by['ac repair dallas']).toMatchObject({ position: 7, url: 'https://myhvac.com/ac-repair', volume: 1000, status: 'kept' });
    expect(by['dallas ac repair company']).toMatchObject({ gscClicks: 4, position: 6.2, sources: ['gsc'] });
    expect(by['ac repair jobs']?.status).toBe('removed');
    expect(by['ac repair houston']?.removeReason).toBe('Another location (houston)');
    expect(by['rival hvac reviews']?.removeReason).toBe('Competitor brand (rivalhvac)');
    expect(by['furnace repair dallas']).toMatchObject({ position: null, sources: ['competitor'] });
    expect(by['ac repair dallas zzz odd phrasing']).toMatchObject({ volume: 0, status: 'kept' }); // customer language
    expect(r.workspace.lastRunAt).not.toBeNull();
    expect(r.cost).toBeGreaterThan(0);
  });

  it('clusters by shared results, scores priority and flags quick wins', async () => {
    const { client, calls } = fake();
    const ws = {
      ...emptyKeywordWorkspace('myhvac.com'),
      keywords: [
        rec('ac repair dallas', { volume: 1000, position: 7, url: 'https://myhvac.com/ac' }),
        rec('dallas ac service', { volume: 400 }),
        rec('furnace repair dallas', { volume: 300, difficulty: 80, cpc: 20 }),
        rec('ac repair dallas tx', { volume: 0 }),
        rec('old removed', { status: 'removed' }),
      ],
    };
    const r = await clusterKeywords(client, ws, { maxSerps: 3 });
    expect(calls.filter((c) => c.startsWith('serp:'))).toHaveLength(3);
    expect(r.workspace.clusters.map((c) => c.head)).toEqual(['ac repair dallas', 'furnace repair dallas']);
    const ac = r.workspace.clusters[0]!;
    expect(ac).toMatchObject({ size: 3, quickWin: true, bestPosition: 7, businessValue: 4, rankingChance: 5, priority: 20 });
    const furnace = r.workspace.clusters[1]!;
    expect(furnace).toMatchObject({ businessValue: 4, rankingChance: 1, longTerm: true, quickWin: false });
    expect(r.workspace.keywords.find((k) => k.term === 'ac repair dallas tx')?.clusterId).toBe(ac.id); // joined by shared words
    expect(r.workspace.keywords.find((k) => k.term === 'old removed')?.clusterId).toBeNull();

    // Re-run: SERPs are cached, hand-set scores stay.
    const edited = updateCluster(r.workspace, furnace.id, { businessValue: 2, rankingChance: 3 });
    const again = await clusterKeywords(fake().client, edited, { maxSerps: 3 });
    expect(again.serps).toBe(0);
    expect(again.workspace.clusters.find((c) => c.id === furnace.id)).toMatchObject({ businessValue: 2, rankingChance: 3, priority: 6, scoresLocked: true });
    expect(competitorSearchesFromClusters(again.workspace)).toEqual(['ac repair dallas', 'furnace repair dallas']);
  });

  it('finds the seasonal peak and a publish-by date two months earlier', () => {
    const trend = [100, 100, 100, 100, 300, 600, 700, 400, 100, 100, 100, 100]; // Jan–Dec, peak July
    const s = seasonality([rec('ac', { trend, trendFrom: '2025-01' })], new Date('2026-02-10T00:00:00Z'));
    expect(s).toEqual({ peak: 7, deadline: '2026-05-01' });
    expect(seasonality([rec('flat', { trend: Array(12).fill(100), trendFrom: '2025-01' })], new Date())).toEqual({ peak: null, deadline: null });
    // Peak too close: publish as soon as possible.
    expect(seasonality([rec('ac', { trend, trendFrom: '2025-01' })], new Date('2026-06-10T00:00:00Z')).deadline).toBe('2026-06-10');
  });

  it('manual status, additions, CSV export and import', () => {
    let ws = { ...emptyKeywordWorkspace('myhvac.com'), keywords: [rec('ac repair', { volume: 10 })] };
    ws = setKeywordStatus(ws, 'ac repair', 'removed');
    expect(ws.keywords[0]).toMatchObject({ status: 'removed', statusLocked: true, removeReason: 'Removed by hand' });
    const added = addKeywords(ws, ['Heat Pump Install', 'ac repair', '=cmd'], 'import');
    expect(added.added).toEqual(['heat pump install', 'cmd']);
    const csv = keywordsToCsv(added.workspace);
    expect(csv.split('\r\n')[0]).toContain('keyword,status,reason');
    expect(parseKeywordCsv('Top queries,Clicks\r\n"ac repair, dallas",4\r\nfurnace tune up,2\r\n')).toEqual(['ac repair dallas', 'furnace tune up']);
    expect(parseKeywordCsv('heat pump\nboiler service')).toEqual(['heat pump', 'boiler service']);
  });

  it('writes 30–50 AI prompts, falling back to templates without OpenAI', async () => {
    const seeds = { services: ['AC repair', 'Furnace repair'], locations: ['Dallas', 'Plano'], brands: [], extra: [] };
    const t = templatePrompts(seeds);
    expect(t.length).toBeGreaterThanOrEqual(24);
    expect(t[0]).toMatchObject({ text: 'Who is the best ac repair company in Dallas?', service: 'ac repair', location: 'Dallas' });
    expect((await generatePrompts(null, seeds, 'myhvac.com')).usedAi).toBe(false);

    let sent = '';
    const ai = {
      async generateJson(req: { user: string }) {
        sent = req.user;
        return { tokens: 900, model: 'x', data: { prompts: Array.from({ length: 35 }, (_, i) => ({ text: `Which AC repair company in Dallas is best, option ${i}?`, service: 'AC repair', location: 'Dallas' })) } };
      },
    } as unknown as OpenAiClient;
    const r = await generatePrompts(ai, seeds, 'myhvac.com');
    expect(r).toMatchObject({ usedAi: true, tokens: 900 });
    expect(r.prompts).toHaveLength(35);
    expect(r.prompts[0]).toMatchObject({ service: 'ac repair', location: 'dallas' });
    expect(JSON.parse(sent)).toEqual({ website: 'myhvac.com', services: seeds.services, locations: seeds.locations, brands: [], other_topics: [] });
  });
});
