import { describe, expect, it } from 'vitest';
import {
  buildMapping, draftableRows, evaluateRules, mappingToCsv, pageKeywordMap, schemaFor, updateMappingRow, writeDrafts,
  type AuditData, type KeywordCluster, type KeywordRecord, type OpenAiClient, type ReportPage,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Module 5 · Keyword to page mapping. */
const cluster = (id: string, head: string, extra: Partial<KeywordCluster> = {}): KeywordCluster => ({
  id, name: head.charAt(0).toUpperCase() + head.slice(1), head, size: 1, intent: 'commercial', pageType: 'service', volume: 500, businessValue: 4, rankingChance: 4,
  scoresLocked: false, priority: 16, bestPosition: null, bestUrl: null, quickWin: false, longTerm: false, seasonalPeak: null, seasonalDeadline: null, ...extra,
});
const kw = (term: string, clusterId: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['seed'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId, addedAt: '', ...extra,
});
const page = (path: string, extra: Partial<ReportPage> = {}): ReportPage => ({ url: `https://myhvac.com${path}`, title: null, h1: null, words: 600, pageType: 'service', schemaTypes: [], links: [], ...extra });

const pages = [
  page('/', { title: 'MyHVAC Dallas', pageType: 'home', words: 900, links: ['https://myhvac.com/services/ac-repair/'], schemaTypes: ['HVACBusiness'] }),
  page('/services/ac-repair/', { title: 'AC Repair Dallas', h1: 'AC repair', schemaTypes: ['Service'] }),
  page('/ac-repair-old/', { title: 'Air conditioner repair', words: 400 }),
  page('/services/furnace/', { title: 'Furnace repair', words: 120 }),
  page('/about/', { title: 'About us', pageType: 'about' }),
];
const clusters = [
  cluster('ac-repair-dallas', 'ac repair dallas', { priority: 20 }),
  cluster('furnace-repair', 'furnace repair', { priority: 12 }),
  cluster('heat-pump-installation', 'heat pump installation', { priority: 15 }),
  cluster('hvac-near-me', 'hvac near me', { priority: 8, pageType: 'home' }),
];
const keywords = [
  kw('ac repair dallas', 'ac-repair-dallas', { volume: 1000 }),
  kw('dallas ac repair company', 'ac-repair-dallas', { volume: 200 }),
  kw('furnace repair', 'furnace-repair'),
  kw('heat pump installation', 'heat-pump-installation'),
  kw('hvac near me', 'hvac-near-me', { position: 2, url: 'https://myhvac.com/' }),
];
const gsc = [
  { query: 'ac repair dallas', page: 'https://myhvac.com/services/ac-repair/', clicks: 30, impressions: 900, position: 7 },
  { query: 'ac repair dallas', page: 'https://myhvac.com/ac-repair-old/', clicks: 10, impressions: 300, position: 15 },
];
const build = (over: Partial<Parameters<typeof buildMapping>[0]> = {}) =>
  buildMapping({ domain: 'myhvac.com', clusters, keywords, pages, gsc, brand: 'MyHVAC', place: 'Dallas', auditId: 'a1', now: new Date('2026-11-17T10:00:00Z'), ...over });

describe('keyword to page mapping', () => {
  it('picks a page per topic and the action from the evidence', () => {
    const ws = build();
    const by = Object.fromEntries(ws.rows.map((r) => [r.clusterId, r]));
    // Highest priority first.
    expect(ws.rows.map((r) => r.clusterId)).toEqual(['ac-repair-dallas', 'heat-pump-installation', 'furnace-repair', 'hvac-near-me']);
    // Search Console clicks pick the page; a second page with ≥ 20% of the clicks is a conflict → merge.
    expect(by['ac-repair-dallas']).toMatchObject({
      url: 'https://myhvac.com/services/ac-repair/', action: 'merge', currentPosition: 7, targetPosition: 3, reason: 'Gets 30 clicks from Google for these searches',
      conflicts: [{ url: 'https://myhvac.com/ac-repair-old/', share: 0.25 }], secondaryKeywords: ['dallas ac repair company'],
    });
    // Title match, but a thin page (< 300 words): expand.
    expect(by['furnace-repair']).toMatchObject({ url: 'https://myhvac.com/services/furnace/', action: 'expand', reason: 'Title, heading or address matches this topic', targetPosition: 10 });
    // Nothing targets it: new page needed, with its type and where to link from.
    expect(by['heat-pump-installation']).toMatchObject({ url: null, action: 'create', newPageType: 'service', schemaNeeded: ['Service', 'BreadcrumbList'] });
    // Already in the top 3: leave it.
    expect(by['hvac-near-me']).toMatchObject({ url: 'https://myhvac.com/', action: 'leave', currentPosition: 2, schemaNeeded: [] });
    // Template drafts with the place, and links from relevant pages that do not link there yet.
    expect(by['furnace-repair']?.drafts).toMatchObject({ title: 'Furnace Repair in Dallas | MyHVAC', h1: 'Furnace Repair in Dallas', source: 'template', approved: false });
    expect(by['ac-repair-dallas']?.drafts?.h1).toBe('AC Repair Dallas'); // abbreviations stay in capitals
    expect(by['ac-repair-dallas']?.linksToAdd.map((l) => l.from)).toEqual(['https://myhvac.com/ac-repair-old/']); // the homepage already links
    expect(ws.usedSearchConsole).toBe(true);
  });

  it('keeps hand-made choices when the plan is rebuilt', () => {
    let ws = build();
    ws = updateMappingRow(ws, 'heat-pump-installation', { url: 'https://myhvac.com/about/', action: 'optimise', status: 'in_progress', owner: 'Sara' });
    ws = updateMappingRow(ws, 'furnace-repair', { drafts: { title: 'Furnace Repair Dallas – Same Day | MyHVAC', approved: true } });
    const again = build({ previous: ws });
    const by = Object.fromEntries(again.rows.map((r) => [r.clusterId, r]));
    expect(by['heat-pump-installation']).toMatchObject({ url: 'https://myhvac.com/about/', urlLocked: true, action: 'optimise', actionLocked: true, status: 'in_progress', owner: 'Sara', reason: 'Chosen by hand' });
    expect(by['furnace-repair']?.drafts).toMatchObject({ title: 'Furnace Repair Dallas – Same Day | MyHVAC', approved: true });
  });

  it('expects schema per page type, counting local business subtypes', () => {
    expect(schemaFor('home', ['HVACBusiness'], false)).toEqual([]);
    expect(schemaFor('service', [], true)).toEqual(['Service', 'FAQPage', 'BreadcrumbList']);
    expect(schemaFor('location', ['Plumber', 'BreadcrumbList'], false)).toEqual(['Service']);
  });

  it('feeds the mapped keyword into the on-page rules', () => {
    const ws = build();
    const map = pageKeywordMap(ws);
    expect(map['myhvac.com/services/furnace']).toBe('furnace repair');
    // The address says "furnace", but the page is meant to rank for "heat pump installation".
    const c = parsePageContent('<html><head><title>Furnace service | MyHVAC</title></head><body><h1>Furnace service</h1></body></html>', 'https://myhvac.com/services/furnace/');
    const data = { url: 'https://myhvac.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight: { origin: 'https://myhvac.com', homepage: { url: 'https://myhvac.com/', status: 200, finalUrl: 'https://myhvac.com/', headers: {}, robotsDirectives: [] }, variants: [], robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] }, sitemaps: [], sitemapUrlChecks: [], sitemapUrlTotal: 0, botAccess: [] }, summary: null, pages: [], psi: null, content: [c] } as unknown as AuditData;
    const before = Object.fromEntries(evaluateRules(data).map((r) => [r.def.id, r.result]));
    const after = Object.fromEntries(evaluateRules({ ...data, pageKeywords: { 'myhvac.com/services/furnace': 'heat pump installation' } }).map((r) => [r.def.id, r.result]));
    expect(before['2.1.4']).toMatchObject({ status: 'pass' });
    expect(before['2.3.2']).toMatchObject({ status: 'pass' });
    expect(after['2.1.4']).toMatchObject({ affectedCount: 1 });
    expect(after['2.1.4']?.message.expert).toContain('mapped primary keyword');
    expect(after['2.3.2']).toMatchObject({ affectedCount: 1 });
  });

  it('never sends keywords found only through Search Console to the AI', async () => {
    const gscKeywords = [...keywords.map((k) => (k.term === 'dallas ac repair company' ? { ...k, sources: ['gsc' as const] } : k)), kw('furnace repair', 'furnace-repair', { sources: ['gsc'] })];
    const ws = build({ keywords: gscKeywords });
    const rows = draftableRows(ws, gscKeywords);
    expect(rows.map((r) => r.clusterId)).not.toContain('furnace-repair');
    let sent = '';
    const ai = { async generateJson(req: { user: string }) {
      sent = req.user;
      return { tokens: 500, model: 'x', data: { pages: rows.map((r) => ({ id: r.clusterId, title: `${r.primaryKeyword} title`, h1: 'H1', meta: 'Meta' })) } };
    } } as unknown as OpenAiClient;
    const r = await writeDrafts(ai, rows, { brand: 'MyHVAC', place: 'Dallas', keywords: gscKeywords, currentTitles: {} });
    expect(sent).not.toContain('dallas ac repair company');
    expect(Object.keys(r.drafts)).toEqual(rows.map((x) => x.clusterId));
  });

  it('exports the plan as CSV', () => {
    const csv = mappingToCsv(build());
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('priority,topic,page,action');
    expect(lines).toHaveLength(5);
    expect(csv).toContain('NEW PAGE NEEDED');
  });
});
