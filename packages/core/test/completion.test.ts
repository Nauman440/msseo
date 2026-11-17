import { afterEach, describe, expect, it, vi } from 'vitest';
import { clusterKeywords, createKeywordClient, emptyKeywordWorkspace, evaluateRules, queryKeywords, researchKeywords, type AuditData, type KeywordClient, type KeywordRecord } from '../src';
import { parsePageContent, smallFontCount, zoomBlocked, type PageContent } from '../src/audit/page-content';
import { readMobileUsability, type PageSpeedResult } from '../src/providers/pagespeed';

/** Modules 1–4 completion (2026-11-17): 1.9.2, 1.13.2, 1.13.3, quick-mode 1.12.7/2.6.3, PAA questions, SERP features, keyword gap. */

const preflight: AuditData['preflight'] = {
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: {}, robotsDirectives: [] },
  variants: [{ url: 'https://example.com/', status: 200 }],
  robots: { found: true, status: 200, body: 'User-agent: *', sitemaps: [], disallowAll: [] },
  sitemaps: [],
  sitemapUrlChecks: [],
  sitemapUrlTotal: 0,
  botAccess: [{ ua: 'googlebot', status: 200 }],
};
const data = (content: PageContent[], over: Partial<AuditData> = {}): AuditData => ({
  url: 'https://example.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '2026-11-17T00:00:00Z', preflight, summary: null, pages: [], psi: null, content, ...over,
});
const results = (d: AuditData) => Object.fromEntries(evaluateRules(d).map((r) => [r.def.id, r.result]));
const page = (url: string, head = '', body = '<h1>Page</h1>') => parsePageContent(`<html lang="en"><head>${head}</head><body>${body}</body></html>`, url);

describe('1.9.2 tap targets, zoom and font size', () => {
  it('reads zoom and small fonts from the page, and tap targets from Lighthouse', () => {
    expect(zoomBlocked('width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')).toBe(true);
    expect(zoomBlocked('width=device-width, maximum-scale=5')).toBe(false);
    expect(smallFontCount('<style>.a{font-size:10px}.b{font-size: 0.6rem}.c{font-size:16px}</style><p style="font-size:8pt">x</p>')).toBe(3);
    expect(readMobileUsability({ 'target-size': { score: 0, details: { items: [{}, {}, {}] } }, 'meta-viewport': { score: 1 } })).toEqual({ smallTapTargets: 3, zoomDisabled: false });
    expect(readMobileUsability({})).toEqual({ smallTapTargets: null, zoomDisabled: null });

    const ok = page('https://example.com/', '<meta name="viewport" content="width=device-width">');
    expect(results(data([ok]))['1.9.2']).toMatchObject({ status: 'pass' });

    const tiny = page('https://example.com/a/', '<meta name="viewport" content="width=device-width, user-scalable=no"><style>' + '.x{font-size:10px}'.repeat(5) + '</style>');
    const psi: PageSpeedResult = { strategy: 'mobile', url: 'https://example.com/', performance: 90, field: null, lab: {}, renderBlockingMs: null, mobileUsability: { smallTapTargets: 4, zoomDisabled: true } };
    const r = results(data([ok, tiny], { psi }))['1.9.2'];
    expect(r).toMatchObject({ status: 'warn' });
    expect(r?.message.client).toBe('On phones: 4 buttons or links too small or too close together on the homepage; zooming is turned off; very small text on 1 page');
  });
});

describe('1.13.2 / 1.13.3 international', () => {
  const tags = (self: string, other: string, back = true, xdefault = true) =>
    `<link rel="alternate" hreflang="${self}" href="https://example.com/${self}/">` +
    (back ? `<link rel="alternate" hreflang="${other}" href="https://example.com/${other}/">` : '') +
    (xdefault ? '<link rel="alternate" hreflang="x-default" href="https://example.com/en/">' : '');

  it('needs return links, an x-default and a matching html lang; hidden without hreflang', () => {
    const en = parsePageContent(`<html lang="en"><head>${tags('en', 'fr')}</head><body><h1>Hi</h1></body></html>`, 'https://example.com/en/');
    const frOk = parsePageContent(`<html lang="fr"><head>${tags('fr', 'en')}</head><body><h1>Salut</h1></body></html>`, 'https://example.com/fr/');
    expect(results(data([en, frOk]))).toMatchObject({ '1.13.2': { status: 'pass' }, '1.13.3': { status: 'pass' } });

    const frNoBack = parsePageContent(`<html lang="de"><head>${tags('fr', 'en', false, false)}</head><body><h1>Salut</h1></body></html>`, 'https://example.com/fr/');
    const r = results(data([en, frNoBack]));
    expect(r['1.13.2']).toMatchObject({ affectedCount: 1 }); // en → fr, but fr does not point back
    expect(r['1.13.3']).toMatchObject({ affectedCount: 1 }); // fr: no x-default and lang="de"

    const plain = results(data([page('https://example.com/')]));
    expect(plain['1.13.2']).toBeUndefined();
    expect(plain['1.13.3']).toBeUndefined();
  });
});

describe('1.12.7 / 2.6.3 in quick audits (links among the checked pages)', () => {
  it('flags key pages linked from few checked pages', () => {
    const nav = '<a href="/services/ac-repair/">AC</a><a href="/services/heating/">Heat</a><a href="/about/">About</a>';
    const pages = [
      page('https://example.com/', '', `<h1>Home</h1>${nav}`),
      page('https://example.com/services/ac-repair/', '', `<h1>AC</h1>${nav}`),
      page('https://example.com/services/heating/', '', `<h1>Heat</h1>${nav}`),
      page('https://example.com/about/', '', `<h1>About</h1>${nav}`),
      page('https://example.com/services/ducts/', '', '<h1>Ducts</h1>'),
    ];
    const r = results(data(pages));
    expect(r['2.6.3']).toMatchObject({ affectedCount: 1 }); // only /services/ducts/ (0 links)
    expect(r['1.12.7']).toMatchObject({ affectedCount: 1 });
    expect(r['2.6.3']?.message.expert).toContain('of the 5 checked pages');
  });
});

describe('DataForSEO parsing (sample responses, no live calls)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (result: Record<string, unknown>) =>
    new Response(JSON.stringify({ status_code: 20000, status_message: 'Ok.', cost: 0.002, tasks: [{ status_code: 20000, status_message: 'Ok.', result: [result] }] }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('reads organic URLs, "People also ask" questions and SERP features from the advanced SERP', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      reply({
        item_types: ['local_pack', 'organic', 'people_also_ask', 'video'],
        items: [
          { type: 'local_pack', title: 'Rival', domain: 'rival.com' },
          { type: 'organic', url: 'https://a.com/ac', domain: 'a.com', rank_group: 1 },
          { type: 'people_also_ask', items: [{ type: 'people_also_ask_element', title: 'How much is AC repair?' }, { type: 'people_also_ask_element', title: 'Is AC repair worth it?' }] },
          { type: 'organic', url: 'https://b.com/ac', domain: 'b.com', rank_group: 2 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = createKeywordClient({ login: 'x', password: 'y', baseUrl: 'https://api.example' });
    const r = await c.serpUrls('ac repair dallas', { country: 'United States', language: 'en' });
    expect(r).toEqual({ cost: 0.002, urls: ['https://a.com/ac', 'https://b.com/ac'], questions: ['How much is AC repair?', 'Is AC repair worth it?'], features: ['local_pack', 'people_also_ask', 'video'] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v3/serp/google/organic/live/advanced');
  });

  it('reads the keyword gap from domain_intersection', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))[0]).toMatchObject({ target1: 'rival.com', target2: 'myhvac.com', intersections: false });
      return reply({ items: [{ keyword_data: { keyword: 'Furnace Repair Dallas', keyword_info: { search_volume: 880, cpc: 31 }, keyword_properties: { keyword_difficulty: 12 }, search_intent_info: { main_intent: 'commercial' } }, first_domain_serp_element: { rank_group: 3, url: 'https://rival.com/furnace' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = createKeywordClient({ login: 'x', password: 'y', baseUrl: 'https://api.example' });
    const r = await c.keywordGap('rival.com', 'myhvac.com', { country: 'United States', language: 'en' });
    expect(r.keywords[0]).toMatchObject({ term: 'furnace repair dallas', volume: 880, difficulty: 12, intent: 'commercial', position: 3 });
  });
});

describe('keyword workspace: gap, questions and features', () => {
  const rec = (term: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
    term, volume: 500, trend: null, trendFrom: null, difficulty: 10, cpc: 5, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null,
    sources: ['seed'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '', ...extra,
  });

  it('uses the gap call for competitors and falls back to their rankings if it fails', async () => {
    const calls: string[] = [];
    const client = {
      rankedKeywords: async (t: string) => (calls.push(`ranked:${t}`), { cost: 0.01, keywords: [] }),
      keywordGap: async (t: string) => {
        calls.push(`gap:${t}`);
        if (t === 'broken.com') throw new Error('400');
        return { cost: 0.02, keywords: [{ term: 'ac repair dallas cost', volume: 90, trend: null, trendFrom: null, difficulty: 5, cpc: 9, intent: 'commercial', position: 2, url: 'https://rival.com/x' }] };
      },
      suggestions: async () => ({ cost: 0, keywords: [] }),
      autocomplete: async () => ({ cost: 0, suggestions: [] }),
      overview: async () => ({ cost: 0, keywords: [] }),
    } as unknown as KeywordClient;
    const ws = emptyKeywordWorkspace('myhvac.com', { seeds: { services: ['ac repair'] } });
    const r = await researchKeywords(client, ws, { competitors: ['rival.com', 'broken.com'] });
    expect(calls).toEqual(expect.arrayContaining(['gap:rival.com', 'gap:broken.com', 'ranked:broken.com']));
    const k = r.workspace.keywords.find((x) => x.term === 'ac repair dallas cost');
    expect(k).toMatchObject({ sources: ['competitor'], position: null });
    const rows = queryKeywords(r.workspace, { from: 'gap', show: 'all' });
    expect(rows.rows.map((x) => [x.term, x.gap])).toEqual([['ac repair dallas cost', true]]);
  });

  it('keeps "People also ask" questions and page-1 features from the topic checks', async () => {
    const client = {
      serpUrls: async (q: string) => ({ cost: 0.002, urls: ['https://a.com/1', 'https://b.com/1', 'https://c.com/1'], questions: [`What does ${q} cost?`, 'Shared question?'], features: ['local_pack', 'people_also_ask'] }),
    } as unknown as KeywordClient;
    const ws = { ...emptyKeywordWorkspace('myhvac.com'), keywords: [rec('ac repair'), rec('ac repair near me')] };
    const r = await clusterKeywords(client, ws);
    expect(r.workspace.questions?.map((q) => q.text).sort()).toEqual(['Shared question?', 'What does ac repair cost?', 'What does ac repair near me cost?']);
    expect(r.workspace.keywords[0]?.serpFeatures).toEqual(['local_pack', 'people_also_ask']);
    expect(queryKeywords(r.workspace, {}).rows[0]?.features).toEqual(['Map pack', 'People also ask']);
  });
});
