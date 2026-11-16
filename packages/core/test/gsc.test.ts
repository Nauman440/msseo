import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateRules, matchGscProperties, type AuditData } from '../src';
import { collectGsc, gscRanges, type GscData } from '../src/audit/gsc-collect';
import { parsePageContent } from '../src/audit/page-content';
import { expectedCtr } from '../src/scoring/ctr-curve';
import type { GscRow } from '../src/providers/gsc';

const U = (p: string) => `https://www.example.com${p}`;
const row = (keys: string[], clicks: number, impressions: number, position: number): GscRow => ({ keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

const preflight: AuditData['preflight'] = {
  origin: 'https://www.example.com',
  homepage: { url: U('/'), status: 200, finalUrl: U('/'), headers: {}, robotsDirectives: [] },
  variants: [], robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] },
  sitemaps: [{ url: U('/sitemap.xml'), status: 200, valid: true, isIndex: false, urls: [U('/'), U('/ac-repair/'), U('/heating/')] }],
  sitemapUrlChecks: [], sitemapUrlTotal: 3, botAccess: [],
};

const gsc = (over: Partial<GscData> = {}): GscData => ({
  property: 'sc-domain:example.com', rangeDays: 90,
  current: { start: '2026-08-15', end: '2026-11-13' }, previous: { start: '2026-05-17', end: '2026-08-14' },
  pages: [], pagesPrev: [], queries: [], pageQueries: [], sitemaps: [], inspections: [],
  inspectionRequested: 0, inspectionQuotaHit: false, errors: [], ...over,
});

const results = (d: Partial<AuditData>) =>
  Object.fromEntries(
    evaluateRules({ url: U('/'), pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: null, ...d }).map((r) => [r.def.id, r.result]),
  );

describe('Search Console helpers', () => {
  it('matches domain and URL-prefix properties to the audited host', () => {
    const props = ['https://example.com/', 'https://www.example.com/', 'sc-domain:example.com', 'sc-domain:other.com', 'https://shop.example.com/'];
    expect(matchGscProperties(props, 'https://www.example.com/page')).toEqual(['sc-domain:example.com', 'https://www.example.com/', 'https://example.com/']);
    expect(matchGscProperties(props, 'https://blog.example.com/')).toEqual(['sc-domain:example.com']);
    expect(matchGscProperties(props, 'https://nope.org/')).toEqual([]);
  });

  it('builds the current and previous ranges, ending 3 days ago', () => {
    expect(gscRanges(28, new Date('2026-11-16T12:00:00Z'))).toEqual({ current: { start: '2026-10-17', end: '2026-11-13' }, previous: { start: '2026-09-19', end: '2026-10-16' } });
  });

  it('interpolates expected CTR by position', () => {
    expect(expectedCtr(1)).toBeCloseTo(0.28);
    expect(expectedCtr(3.5)).toBeCloseTo(0.095);
    expect(expectedCtr(80)).toBeCloseTo(0.002);
  });
});

describe('Search Console rules', () => {
  const home = parsePageContent('<title>Example</title><h1>Example</h1>', U('/'));
  const ac = parsePageContent('<title>Our services | Example AC repair</title><meta name="description" content="We fix things.">', U('/ac-repair/'));
  const heat = parsePageContent('<title>Heating</title>', U('/heating/'));
  const content = [home, ac, heat];

  it('skips every GSC rule when no property was used', () => {
    const r = results({ content });
    for (const id of ['1.3.3', '1.3.4', '1.3.5-g', '1.4.1-g', '2.9.1', '2.9.3', '2.9.4', '2.9.5']) expect(r[id]).toBeUndefined();
  });

  it('evaluates indexing, sitemap, cannibalisation, CTR, quick wins and decay', () => {
    const r = results({
      content,
      gsc: gsc({
        pages: [row([U('/')], 500, 2000, 1.5), row([U('/ac-repair/')], 2, 1500, 3), row([U('/tag/ac/')], 0, 40, 30)],
        pagesPrev: [row([U('/')], 210, 2100, 1.4), row([U('/ac-repair/')], 50, 1400, 3)],
        queries: [row(['ac repair'], 5, 900, 6.2), row(['example'], 200, 1000, 1.1), row(['furnace'], 0, 30, 9)],
        pageQueries: [row([U('/'), 'ac repair'], 3, 400, 7), row([U('/ac-repair/'), 'ac repair'], 2, 500, 6), row([U('/ac-repair/'), 'emergency ac service'], 9, 300, 4)],
        inspections: [
          { url: U('/'), verdict: 'PASS', coverageState: 'Submitted and indexed' },
          { url: U('/heating/'), verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' },
        ],
        inspectionRequested: 3,
      }),
    });
    expect(r['1.3.3']).toMatchObject({ status: 'fail', affectedCount: 1, metrics: { crawled: 3, indexable: 3, inSitemap: 3, indexed: 2 } });
    expect(r['1.3.4']).toMatchObject({ status: 'fail', affectedCount: 1, applicableCount: 2 });
    expect(r['1.3.5-g']?.status).toBe('warn');
    expect(r['1.4.1-g']?.status).toBe('fail'); // nothing submitted
    expect(r['2.9.1']).toMatchObject({ status: 'warn', metrics: { queries: 1 } });
    expect(r['2.9.3']).toMatchObject({ status: 'warn', affectedCount: 1, examples: [{ url: U('/ac-repair/') }] });
    expect(r['2.9.4']).toMatchObject({ status: 'warn', metrics: { queries: 1 } });
    expect(r['2.9.5']).toMatchObject({ status: 'warn', affectedCount: 1 });
    // 2.1.4 / 2.2.4 switch to the page's top query ("emergency ac service") when GSC is present.
    expect(r['2.1.4']).toMatchObject({ status: 'warn' });
    expect(r['2.1.4']?.message.expert).toContain('top Search Console query');
  });

  it('passes a healthy property', () => {
    const r = results({
      content: [home],
      gsc: gsc({ sitemaps: [{ path: U('/sitemap.xml'), errors: 0 }], inspections: [{ url: U('/'), verdict: 'PASS' }], pages: [row([U('/')], 300, 1000, 1.2)] }),
    });
    expect(r['1.3.3']?.status).toBe('pass');
    expect(r['1.3.4']?.status).toBe('pass');
    expect(r['1.4.1-g']?.status).toBe('pass');
  });
});

describe('collectGsc', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pulls analytics and sitemaps, inspects URLs and stops at the inspection quota', async () => {
    let inspected = 0;
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (input.includes('urlInspection')) {
        inspected++;
        if (inspected > 2) return new Response('{}', { status: 429 });
        const { inspectionUrl } = JSON.parse(String(init?.body)) as { inspectionUrl: string };
        return Response.json({ inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: `ok ${inspectionUrl}` } } });
      }
      if (input.endsWith('/sitemaps')) return Response.json({ sitemap: [{ path: U('/sitemap.xml'), errors: '0', warnings: '1' }] });
      const body = JSON.parse(String(init?.body)) as { dimensions: string[] };
      return Response.json({ rows: [{ keys: body.dimensions.map((d) => (d === 'page' ? U('/') : 'example')), clicks: 1, impressions: 10, ctr: 0.1, position: 2 }] });
    });
    const d = await collectGsc({ token: 't', property: 'sc-domain:example.com', rangeDays: 28, inspectUrls: Promise.resolve([U('/'), U('/a/'), U('/b/'), U('/c/'), U('/')]) });
    expect(d.pages).toHaveLength(1);
    expect(d.pageQueries[0]!.keys).toEqual([U('/'), 'example']);
    expect(d.sitemaps?.[0]).toMatchObject({ errors: 0, warnings: 1 });
    expect(d.inspectionRequested).toBe(4);
    expect(d.inspections.length).toBe(2);
    expect(d.inspectionQuotaHit).toBe(true);
    expect(d.errors).toEqual([]);
  });
});

describe('AI input', () => {
  it('never includes Search Console findings or notices', async () => {
    const { aiInput, buildReport } = await import('../src');
    const content = [parsePageContent('<title>Heating</title>', U('/heating/'))];
    const report = buildReport(
      { url: U('/'), pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: null, content,
        gsc: gsc({ queries: [row(['secret query'], 1, 900, 6)], inspections: [{ url: U('/heating/'), verdict: 'NEUTRAL' }] }),
        notices: [{ client: 'x', expert: 'Search Console partial: boom' }] },
      { auditId: 'a', audience: 'expert', brand: 'b' },
    );
    expect(report.issues?.some((i) => i.ruleId === '2.9.4')).toBe(true);
    const sent = JSON.stringify(aiInput(report));
    expect(sent).not.toContain('secret query');
    expect(sent).not.toContain('"id":"2.9.4"');
    expect(sent).not.toContain('"id":"1.3.4"');
    expect(sent).not.toContain('Search Console partial');
  });
});
