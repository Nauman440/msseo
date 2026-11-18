import { describe, expect, it } from 'vitest';
import {
  addTopicKeyword, briefToMarkdown, buildMapping, checkPage, emptyActions, fromMappingRow, keywordMap, mappingSummary, moveKeyword, needsCheck, needsYou,
  pageBrief, pageFixes, pageKeywordMap, pathWords, topicKeywords, updateMappingRow, upsertPageChanges,
  type KeywordCluster, type KeywordRecord, type ReportPage,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Module 5 completion: one page per topic, sitemap pages, settled conflicts, the one-page keyword map and briefs. */
const cluster = (id: string, head: string, extra: Partial<KeywordCluster> = {}): KeywordCluster => ({
  id, name: head.charAt(0).toUpperCase() + head.slice(1), head, size: 1, intent: 'transactional', pageType: 'service', volume: 500, businessValue: 4, rankingChance: 4,
  scoresLocked: false, priority: 16, bestPosition: null, bestUrl: null, quickWin: false, longTerm: false, seasonalPeak: null, seasonalDeadline: null, ...extra,
});
const kw = (term: string, clusterId: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'transactional', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['seed'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId, addedAt: '', ...extra,
});
const page = (path: string, extra: Partial<ReportPage> = {}): ReportPage => ({ url: `https://myhvac.com${path}`, title: null, h1: null, words: 600, pageType: 'service', schemaTypes: [], links: [], ...extra });
const NOW = new Date('2026-11-18T10:00:00Z');

describe('page plan: matching pages to topics', () => {
  it('uses sitemap pages before saying a page is missing, and never crashes on bad addresses', () => {
    const ws = buildMapping({
      domain: 'myhvac.com',
      clusters: [cluster('duct', 'duct cleaning'), cluster('thermo', 'smart thermostat installation', { priority: 10 })],
      keywords: [kw('duct cleaning', 'duct'), kw('smart thermostat installation', 'thermo')],
      pages: [page('/', { pageType: 'home' }), page('/bad%E0%A4%A/', { title: 'Odd page' })],
      sitemapUrls: ['https://myhvac.com/services/duct-cleaning/', 'https://myhvac.com/'],
      brand: 'MyHVAC',
      now: NOW,
    });
    const duct = ws.rows.find((r) => r.clusterId === 'duct')!;
    expect(duct).toMatchObject({ url: 'https://myhvac.com/services/duct-cleaning/', match: 'low', action: 'optimise' });
    expect(duct.reason).toContain('sitemap');
    expect(ws.rows.find((r) => r.clusterId === 'thermo')).toMatchObject({ url: null, action: 'create' });
    expect(ws.sitemapOnly).toEqual(['https://myhvac.com/services/duct-cleaning/']);
    expect(pathWords('https://myhvac.com/bad%E0%A4%A/')).toBe('bad%E0%A4%A');
  });

  it('gives each page to one topic: the lower-priority topic gets another page or a new one', () => {
    const ws = buildMapping({
      domain: 'myhvac.com',
      clusters: [cluster('ac', 'ac repair', { priority: 20 }), cluster('ac2', 'ac repair service', { priority: 9 }), cluster('heat', 'heating repair', { priority: 12 })],
      keywords: [kw('ac repair', 'ac'), kw('ac repair service', 'ac2'), kw('heating repair', 'heat')],
      pages: [page('/ac-repair/', { title: 'AC repair' }), page('/heating/', { title: 'Heating repair' })],
      brand: 'MyHVAC',
      now: NOW,
    });
    const by = Object.fromEntries(ws.rows.map((r) => [r.clusterId, r]));
    expect(by.ac).toMatchObject({ url: 'https://myhvac.com/ac-repair/', match: 'medium' });
    expect(by.heat).toMatchObject({ url: 'https://myhvac.com/heating/' });
    // The only matching page already belongs to "Ac repair": a new page, with the reason.
    expect(by.ac2).toMatchObject({ url: null, action: 'create' });
    expect(by.ac2!.reason).toContain('already targets “Ac repair”');
    expect(needsYou(by.ac2!)).toBe(true);
  });

  it('settles a conflict: differentiate keeps the page, merge sets the action; both keep the keyword for the audit', () => {
    const gsc = [
      { query: 'ac repair', page: 'https://myhvac.com/ac-repair/', clicks: 30, impressions: 900, position: 6 },
      { query: 'ac repair', page: 'https://myhvac.com/blog/ac-tips/', clicks: 15, impressions: 400, position: 18 },
    ];
    const input = { domain: 'myhvac.com', clusters: [cluster('ac', 'ac repair')], keywords: [kw('ac repair', 'ac')], pages: [page('/ac-repair/'), page('/blog/ac-tips/', { pageType: 'blog_post' })], gsc, brand: 'MyHVAC', now: NOW };
    let ws = buildMapping(input);
    expect(mappingSummary(ws)).toMatchObject({ conflicts: 1, mapped: 0, needsYou: 1 });
    expect(ws.pageQueries?.['myhvac.com/ac-repair']?.[0]).toMatchObject({ query: 'ac repair', clicks: 30 });

    const diff = updateMappingRow(ws, 'ac', { settle: 'differentiate' });
    expect(diff.rows[0]).toMatchObject({ conflictSettled: true, conflictPlan: 'differentiate', action: 'optimise', urlLocked: true });
    // Settled stays settled after a rebuild.
    expect(buildMapping({ ...input, previous: diff }).rows[0]).toMatchObject({ conflictSettled: true, conflictPlan: 'differentiate' });

    ws = updateMappingRow(ws, 'ac', { settle: 'merge' });
    expect(ws.rows[0]).toMatchObject({ action: 'merge', actionLocked: true });
    expect(pageKeywordMap(ws)['myhvac.com/ac-repair']).toBe('ac repair');
    expect(fromMappingRow(ws.rows[0]!).title).toBe('Merge the pages competing for "ac repair"');
  });

  it('moves keywords between topics and adds keywords by hand', () => {
    const keywords = [kw('heat pump installation', 'hp', { volume: 590 }), kw('heat pump vs furnace', 'hp', { volume: 90 }), kw('furnace repair', 'fr')];
    let ws = buildMapping({ domain: 'myhvac.com', clusters: [cluster('hp', 'heat pump installation'), cluster('fr', 'furnace repair')], keywords, pages: [], brand: 'MyHVAC', now: NOW });
    ws = moveKeyword(ws, 'heat pump vs furnace', 'fr');
    ws = addTopicKeyword(ws, 'heat pump installers', 'hp');
    expect(topicKeywords('hp', 'heat pump installation', keywords, ws).map((k) => k.term)).toEqual(['heat pump installation', 'heat pump installers']);
    expect(topicKeywords('fr', 'furnace repair', keywords, ws).map((k) => k.term)).toEqual(['furnace repair', 'heat pump vs furnace']);
  });
});

describe('the keyword map for one page', () => {
  const html = `<html><head><title>Heat Pumps | MyHVAC</title></head><body>
    <h1>Our Heat Pump Services</h1>
    <p>We fit heat pump installation in Dallas for homes of every size, with rebates explained and a clear quote before any work starts on site.</p>
    <h2>Ductless systems</h2><p>A ductless heat pump suits older homes. Heat pump replacement is quick. Heat pump installers on our team are certified.</p>
  </body></html>`;
  const content = parsePageContent(html, 'https://myhvac.com/services/heat-pumps/');
  const keywords = [
    kw('heat pump installation', 'hp', { volume: 590, position: 8 }),
    kw('heat pump installers', 'hp', { volume: 210 }),
    kw('heat pump cost', 'hp', { volume: 170 }),
    kw('ductless heat pump', 'hp', { volume: 140 }),
    kw('heat pump replacement', 'hp', { volume: 110 }),
    kw('heat pump vs furnace', 'hp', { volume: 90 }),
  ];
  const ws = buildMapping({
    domain: 'myhvac.com', clusters: [cluster('hp', 'heat pump installation')], keywords,
    pages: [page('/services/heat-pumps/', { title: 'Heat Pumps | MyHVAC', h1: 'Our Heat Pump Services' }), page('/', { pageType: 'home', title: 'Heat pump installation and repair' })],
    brand: 'MyHVAC', place: 'Dallas', now: NOW,
    previous: { domain: 'myhvac.com', builtAt: null, auditId: null, usedSearchConsole: false, rows: [{ ...buildMapping({ domain: 'myhvac.com', clusters: [cluster('hp', 'heat pump installation')], keywords, pages: [], brand: 'MyHVAC', place: 'Dallas', now: NOW }).rows[0]!, url: 'https://myhvac.com/services/heat-pumps/', urlLocked: true }] },
  });
  const row = ws.rows[0]!;
  const kws = topicKeywords('hp', row.primaryKeyword, keywords, ws);
  const check = checkPage(content, kws.map((k) => k.term), NOW);

  it('shows where each keyword is and what is missing', () => {
    const map = keywordMap(row, kws, check);
    const by = Object.fromEntries(map.map((m) => [m.term, m]));
    expect(by['heat pump installation']).toMatchObject({ role: 'main', missing: ['title', 'h1', 'meta'], shown: ['first'] });
    expect(by['heat pump installers']).toMatchObject({ role: 'supporting', missing: ['heading'], shown: ['body'] });
    expect(by['heat pump cost']).toMatchObject({ missing: ['heading', 'table'], shown: [] });
    expect(by['ductless heat pump']).toMatchObject({ missing: [], shown: ['body'] });
    expect(by['heat pump vs furnace']).toMatchObject({ missing: ['faq'] });
    expect(needsCheck({ ...row, pageCheck: check }, kws.map((k) => k.term), NOW)).toBe(false);
    expect(needsCheck({ ...row, pageCheck: check }, [...kws.map((k) => k.term), 'new one'], NOW)).toBe(true);
  });

  it('drafts the fixes and sends them to approvals as one action', () => {
    const map = keywordMap({ ...row, pageCheck: check }, kws, check);
    const fixes = pageFixes({ ...row, pageCheck: check }, map, check, { brand: 'MyHVAC', place: 'Dallas', questions: [{ text: 'Is a heat pump better than a furnace in Texas?', keyword: 'heat pump vs furnace' }] });
    expect(fixes.map((f) => f.id)).toEqual(['title', 'h1', 'meta', 'section', 'faq', 'links', 'schema']);
    expect(fixes[0]).toMatchObject({ now: 'Heat Pumps | MyHVAC', suggested: 'Heat Pump Installation in Dallas | MyHVAC' });
    expect(fixes.find((f) => f.id === 'section')!.suggested).toBe('H2 "Heat Pump Installers in Dallas", H2 "Heat Pump Cost in Dallas", with a price range table');
    expect(fixes.find((f) => f.id === 'faq')!.suggested).toBe('Q: Is a heat pump better than a furnace in Texas?');
    // A hand edit replaces the draft.
    const edited = pageFixes(updateMappingRow({ ...ws, rows: [{ ...row, pageCheck: check }] }, 'hp', { edit: { id: 'section', text: 'H2 "Who installs heat pumps"' } }).rows[0]!, map, check, { brand: 'MyHVAC', place: 'Dallas' });
    expect(edited.find((f) => f.id === 'section')).toMatchObject({ suggested: 'H2 "Who installs heat pumps"', edited: true });

    const changes = fixes.slice(0, 2).map((f) => ({ id: f.id, label: f.label, now: f.now, suggested: f.suggested }));
    let n = 0;
    let plan = upsertPageChanges(emptyActions('myhvac.com'), fromMappingRow(row), changes, { newId: () => `a${++n}`, now: NOW });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ approval: 'client', approvedAt: null, changes });
    plan = { ...plan, actions: plan.actions.map((a) => ({ ...a, approvedAt: NOW.toISOString(), approvedBy: 'Client' })) };
    // Same changes again: still approved. Different changes: approval again.
    expect(upsertPageChanges(plan, fromMappingRow(row), changes, { newId: () => 'x', now: NOW }).actions[0]!.approvedAt).not.toBeNull();
    const again = upsertPageChanges(plan, fromMappingRow(row), changes.slice(0, 1), { newId: () => 'x', now: NOW });
    expect(again.actions).toHaveLength(1);
    expect(again.actions[0]).toMatchObject({ approvedAt: null, changes: changes.slice(0, 1) });
  });

  it('writes a brief for a new page', () => {
    const fresh = buildMapping({ domain: 'myhvac.com', clusters: [cluster('cost', 'ac repair cost', { pageType: 'blog_post' })], keywords: [kw('ac repair cost', 'cost'), kw('how much is ac repair', 'cost'), kw('ac repair prices', 'cost')], pages: [], brand: 'MyHVAC', place: 'Dallas', places: ['Dallas'], now: NOW });
    const r = fresh.rows[0]!;
    expect(r).toMatchObject({ suggestedPath: '/blog/ac-repair-cost/', newPageNote: 'Guide with a price range table' });
    const b = pageBrief(r, topicKeywords('cost', r.primaryKeyword, [kw('ac repair cost', 'cost'), kw('how much is ac repair', 'cost'), kw('ac repair prices', 'cost')], fresh), { brand: 'MyHVAC', place: 'Dallas', rivalWords: [1400, 900] });
    expect(b).toMatchObject({ pageType: 'Article', words: '900 to 1,400 (the pages ranking now)', faq: ['How much is ac repair?'] });
    expect(b.outline).toContain('What it costs (price range table)');
    expect(briefToMarkdown(b, 'myhvac.com')).toContain('**Address:** /blog/ac-repair-cost/');
  });
});
