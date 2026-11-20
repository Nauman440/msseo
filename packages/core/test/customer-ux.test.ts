import { describe, expect, it } from 'vitest';
import {
  autoPlan, emptyActions, emptyKeywordWorkspace, LOW_VOLUME, qualityPass, queryKeywords, seedsFromPages, seedsFromPagesHeuristic, siteVocabulary, splitServicePlace,
  type KeywordRecord, type ReportModel, type ReportPage,
} from '../src';

/** Customer experience (2026-11-20): per-site research inputs, low-volume searches hidden, the plan filled by itself. */
const page = (url: string, h1: string, pageType: string, extra: Partial<ReportPage> = {}): ReportPage =>
  ({ url, title: `${h1} | Fold & Feel`, h1, words: 500, pageType, schemaTypes: [], links: [], ...extra }) as ReportPage;

describe('research inputs read from a website\'s own pages', () => {
  it('splits a service and a place out of a title', () => {
    expect(splitServicePlace('AC Repair in Dallas | Cool Co', 'Cool Co')).toEqual({ service: 'Ac repair', place: 'Dallas' });
    expect(splitServicePlace('Professional Furnace Installation Services', null)).toEqual({ service: 'Furnace installation', place: null });
  });

  it('lists services and places from service and place pages; shops get no places', () => {
    const service = seedsFromPagesHeuristic([
      page('https://x.com/', 'Welcome', 'home'),
      page('https://x.com/ac-repair/', 'AC Repair in Dallas', 'service_location'),
      page('https://x.com/furnace/', 'Furnace Repair in Plano', 'service_location'),
      page('https://x.com/about/', 'About us', 'about'),
    ], null);
    expect(service).toEqual({ services: ['Ac repair', 'Furnace repair'], locations: ['Dallas', 'Plano'], businessType: 'services' });
    const shop = seedsFromPagesHeuristic([page('https://s.com/linen/', 'Linen Bedding', 'category', { schemaTypes: ['ItemList'] })], null);
    expect(shop).toMatchObject({ services: ['Linen bedding'], locations: [], businessType: 'shop' });
  });

  it('uses the AI answer when there is one, and falls back on errors', async () => {
    const pages = [page('https://x.com/ac/', 'AC Repair in Dallas', 'service')];
    const ai = { generateJson: async () => ({ data: { businessType: 'services', services: ['AC repair', 'Duct cleaning'], places: ['Dallas'] }, model: 'x', tokens: 120 }) };
    expect(await seedsFromPages(pages, ai as never, null)).toEqual({ services: ['AC repair', 'Duct cleaning'], locations: ['Dallas'], businessType: 'services', tokens: 120 });
    const broken = { generateJson: async () => Promise.reject(new Error('down')) };
    expect((await seedsFromPages(pages, broken as never, null)).services).toEqual(['Ac repair']);
  });
});

describe('low-volume searches', () => {
  it('are left out of the keyword table unless asked for', () => {
    const ws = emptyKeywordWorkspace('x.com');
    const k = (term: string, volume: number | null) => ({ term, volume, status: 'kept', sources: ['seed'], position: null, intent: null, clusterId: null }) as unknown as KeywordRecord;
    ws.keywords = [k('ac repair dallas', 900), k('ac repair near my house', 0), k('odd phrasing', null), k('ac fix', LOW_VOLUME), { ...k('my own words', 0), sources: ['manual'] }];
    // Hand-typed keywords always show.
    expect(queryKeywords(ws, { minVolume: LOW_VOLUME }).rows.map((r) => r.term)).toEqual(['ac repair dallas', 'ac fix', 'my own words']);
    expect(queryKeywords(ws, {}).total).toBe(5);
  });
});

describe('the action plan fills itself', () => {
  it('adds every finding over six months, then nothing new on the next visit', () => {
    const issues = Array.from({ length: 14 }, (_, i) => ({
      ruleId: `1.${i}`, category: 'technical', status: 'fail', severity: 'high', title: { client: `Fix ${i}`, expert: '' }, message: { client: 'Found', expert: '' },
      explain: { client: '', expert: '' }, fix: { client: 'Do it.', expert: '' }, affectedCount: 1, applicableCount: 1, urls: [], ice: { impact: 3, confidence: 3, effort: 2 },
    }));
    const report = { auditId: 'a1', overall: { score: 60 }, issues, pages: [] } as unknown as ReportModel;
    let n = 0;
    const plan = autoPlan(emptyActions('x.com'), report, null, { newId: () => `id${n++}`, now: new Date('2026-11-20T00:00:00Z') });
    expect(plan!.actions).toHaveLength(14);
    expect(new Set(plan!.actions.map((a) => a.bucket))).toEqual(new Set(['d30', 'd60', 'd90']));
    expect(autoPlan(plan!, report, null, { newId: () => 'x' })).toBeNull();
  });
});

describe('keyword quality (relevance, hard keywords, zero-volume)', () => {
  const kw = (term: string, o: Partial<KeywordRecord> = {}) =>
    ({ term, volume: 500, trend: null, trendFrom: null, difficulty: 20, cpc: 2, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null, sources: ['suggestion'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '', ...o }) as KeywordRecord;
  const seeds = { services: ['AC repair', 'furnace repair'], locations: ['Dallas'], brands: [], extra: [] };

  it('keeps only keywords about this website: its research inputs and, once audited, its own pages', () => {
    const list = [kw('ac repair dallas'), kw('heat pump repair'), kw('ac compressor parts wholesale'), kw('pool repair'), kw('my own phrase', { sources: ['manual'] })];
    const out = qualityPass(list, { seeds, siteWords: siteVocabulary(['AC Repair in Dallas', 'Heat Pump Service', 'About Cool Co']) });
    const by = Object.fromEntries(out.map((k) => [k.term, k.status === 'kept' ? 'kept' : k.removeReason]));
    expect(by).toEqual({
      'ac repair dallas': 'kept', // a whole service
      'heat pump repair': 'kept', // "repair" is not enough on its own, but "pump" is on the site and in no service: both checks
      'ac compressor parts wholesale': 'kept', // "ac" is in the inputs and on the pages
      'pool repair': 'Not about this website',
      'my own phrase': 'kept', // typed in by hand
    });
  });

  it('keeps few hard keywords: those you already rank for, then the most searched (10%, at least 5)', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => kw(`ac repair ${i}`, { difficulty: 75, volume: 1000 - i })),
      kw('ac repair ranked', { difficulty: 80, volume: 10, position: 12 }),
      ...Array.from({ length: 20 }, (_, i) => kw(`furnace repair ${i}`, { difficulty: 20 })),
    ];
    const out = qualityPass(list, { seeds });
    const hard = out.filter((k) => k.removeReason?.startsWith('Too hard'));
    expect(hard.map((k) => k.term)).toEqual(['ac repair 5', 'ac repair 6', 'ac repair 7']);
    expect(hard[0]!.removeReason).toBe('Too hard to rank for now (difficulty 75)');
    expect(out.find((k) => k.term === 'ac repair ranked')!.status).toBe('kept');
  });

  it('keeps a few zero-volume searches, only those naming a whole service', () => {
    const list = [
      ...Array.from({ length: 12 }, (_, i) => kw(`ac repair dallas option ${i}`, { volume: 0 })),
      kw('cheap fix for my unit', { volume: 0, sources: ['autocomplete'] }),
      ...Array.from({ length: 20 }, (_, i) => kw(`furnace repair ${i}`)),
    ];
    const out = qualityPass(list, { seeds });
    // 12 name a whole service: 10 kept, 2 cut; the off-topic one is gone before the cap.
    expect(out.filter((k) => k.removeReason === 'Too few searches')).toHaveLength(2);
    expect(out.find((k) => k.term === 'cheap fix for my unit')!.removeReason).toBe('Not about this website');
  });
});
