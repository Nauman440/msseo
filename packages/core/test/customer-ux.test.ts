import { describe, expect, it } from 'vitest';
import {
  autoPlan, emptyActions, emptyKeywordWorkspace, LOW_VOLUME, queryKeywords, seedsFromPages, seedsFromPagesHeuristic, splitServicePlace,
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
