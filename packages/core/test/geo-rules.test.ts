import { describe, expect, it } from 'vitest';
import { auditedPages, evaluateRules, reportStrengths, type AuditData, type ReportModel } from '../src';
import { parsePageContent, type PageContent } from '../src/audit/page-content';
import { factCount } from '../src/audit/rules-geo';

/** Open Graph / X card (2.2.5), article dates (2.4.11), question headings (2.8.5), facts and sources (2.8.6), sameAs (1.11.5). */
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
const data = (content: PageContent[]): AuditData => ({ url: 'https://example.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '2026-11-26T00:00:00Z', preflight, summary: null, pages: [], psi: null, content });
const results = (content: PageContent[]) => Object.fromEntries(evaluateRules(data(content)).map((r) => [r.def.id, r.result]));
const words = (n: number) => Array.from({ length: n }, (_, i) => (i % 12 === 11 ? 'cooling.' : 'cooling')).join(' ');

const HOME_GOOD = `<html><head><title>Home</title>
<meta property="og:title" content="A"><meta property="og:description" content="B"><meta property="og:image" content="https://example.com/a.jpg"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Example","sameAs":["https://facebook.com/example","https://g.page/example"]}</script>
</head><body><main><h1>Example</h1><p>${words(60)}</p></main></body></html>`;

const SERVICE_GOOD = `<html><head><title>AC repair</title>
<meta property="og:title" content="A"><meta property="og:description" content="B"><meta property="og:image" content="https://example.com/a.jpg"></head>
<body><main><h1>AC repair</h1><p>Most repairs take 2 hours and cost from $120. We give a 5 year guarantee on parts. ${words(320)}</p>
<h2>How much does AC repair cost?</h2><p>${words(40)}</p></main></body></html>`;

const ARTICLE_BAD = `<html><head><title>Why is my AC leaking</title></head>
<body><main><h1>Why is my AC leaking</h1><p>${words(400)}</p><h2>Common causes</h2><p>${words(30)}</p></main></body></html>`;

const ARTICLE_GOOD = `<html><head><title>Why is my AC leaking</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","datePublished":"2026-10-01"}</script></head>
<body><main><h1>Why is my AC leaking</h1><p>About 30% of leaks come from a blocked drain line; clearing it takes 20 minutes. Units over 10 years old leak 2x as often.
See <a href="https://www.energy.gov/energysaver/air-conditioning">the Department of Energy guide</a>. ${words(380)}</p>
<h2>What causes an AC to leak water?</h2><p>${words(40)}</p></main></body></html>`;

describe('SEO / GEO / AEO checks from the skill comparison', () => {
  it('parses the X card tag and article dates', () => {
    expect(parsePageContent(HOME_GOOD, 'https://example.com/').twitterCard).toBe(true);
    expect(parsePageContent(ARTICLE_GOOD, 'https://example.com/blog/ac-leak/').dated).toBe(true);
    expect(parsePageContent(ARTICLE_BAD, 'https://example.com/blog/ac-leak/').dated).toBe(false);
    expect(parsePageContent('<html><body><p>Last updated: 3 March 2026</p></body></html>', 'https://example.com/blog/x/').dated).toBe(true);
  });

  it('counts concrete facts but not phone numbers', () => {
    expect(factCount('Most repairs take 2 hours and cost from $120 with a 5 year guarantee.')).toBe(3);
    expect(factCount('Call (214) 555-0100 today')).toBe(0);
  });

  it('passes a well-built site', () => {
    const r = results([
      parsePageContent(HOME_GOOD, 'https://example.com/'),
      parsePageContent(SERVICE_GOOD, 'https://example.com/ac-repair/'),
      parsePageContent(ARTICLE_GOOD, 'https://example.com/blog/ac-leak/'),
    ]);
    expect(r['1.11.5']!.status).toBe('pass');
    expect(r['2.4.11']!.status).toBe('pass');
    expect(r['2.8.5']!.status).toBe('pass');
    expect(r['2.8.6']!.status).toBe('pass');
    expect(r['2.2.5']!.status).toBe('warn'); // the article has no Open Graph tags
    expect(r['2.2.5']!.affectedCount).toBe(1);
  });

  it('flags missing dates, question headings, facts/sources and sameAs', () => {
    const home = parsePageContent('<html><head><title>Home</title></head><body><main><h1>Example</h1></main></body></html>', 'https://example.com/');
    const r = results([home, parsePageContent(ARTICLE_BAD, 'https://example.com/blog/ac-leak/')]);
    expect(r['1.11.5']).toMatchObject({ status: 'warn' });
    expect(r['1.11.5']!.message.expert).toContain('No Organization/LocalBusiness schema');
    expect(r['2.4.11']).toMatchObject({ status: 'warn', affectedCount: 1 });
    expect(r['2.8.5']).toMatchObject({ status: 'warn', affectedCount: 1 });
    expect(r['2.8.6']).toMatchObject({ status: 'warn', affectedCount: 1 });
  });

  it('skips article and share checks when there is nothing to check', () => {
    const r = results([parsePageContent(SERVICE_GOOD, 'https://example.com/ac-repair/')]);
    expect(r['2.4.11']).toBeUndefined();
  });
});

describe('report strengths and pages audited', () => {
  const report = {
    robots: { found: true, rows: [{ ruleId: '1.2.1', status: 'pass', severity: 'high', message: { client: 'robots.txt is fine', expert: 'robots.txt OK' } }], suggested: '' },
    sitemap: { found: true, url: '', rows: [], segments: [] },
    cards: [
      { id: 'titles', title: 'Titles', section: 'onpage', rows: [
        { ruleId: '2.1.1', status: 'pass', severity: 'high', message: { client: 'Every page has a title', expert: 'Titles present' } },
        { ruleId: '2.1.3', status: 'warn', severity: 'medium', message: { client: 'Titles too long', expert: 'x' } },
        { ruleId: '2.1.4', status: 'pass', severity: 'low', message: { client: 'low', expert: 'low' } },
        { ruleId: '1.3.6', status: 'pass', method: 'manual', severity: 'high', message: { client: 'm', expert: 'm' } },
      ] },
    ],
    pages: [
      { url: 'https://example.com/', title: 'Home', h1: 'Home', words: 500, pageType: 'home', schemaTypes: [], links: [] },
      { url: 'https://example.com/ac-repair/', title: 'AC', h1: 'AC', words: 200, pageType: 'service', schemaTypes: [], links: [] },
    ],
    issues: [
      { ruleId: '1.11.1', status: 'fail', severity: 'high', title: { client: 'No business details', expert: 'No schema' }, message: { client: '2 of 2', expert: '2/2' }, urls: ['https://example.com/', 'https://example.com/ac-repair/'] },
      { ruleId: '2.4.9', status: 'fail', severity: 'high', title: { client: 'Thin page', expert: 'Thin' }, message: { client: '1 page', expert: '1' }, urls: ['https://www.example.com/ac-repair'] },
      { ruleId: '2.1.3', status: 'warn', severity: 'medium', title: { client: 'Long title', expert: 'Long' }, message: { client: '1 title', expert: '1' }, urls: ['https://example.com/ac-repair/'] },
    ],
  } as unknown as ReportModel;

  it('lists passed checks that matter, high first, without manual or low ones', () => {
    expect(reportStrengths(report).map((s) => s.ruleId)).toEqual(['1.2.1', '2.1.1']);
  });

  it('lists every page with its type and issues', () => {
    expect(auditedPages(report)).toEqual([
      // Only the site-wide issue touches the homepage, so it is shown there.
      { url: 'https://example.com/', path: '/', type: 'Homepage', words: 500, issues: 1, topIssue: { client: 'No business details', expert: 'No schema' } },
      // The service page's own problem wins over the one every page shares.
      { url: 'https://example.com/ac-repair/', path: '/ac-repair/', type: 'Service page', words: 200, issues: 3, topIssue: { client: 'Thin page', expert: 'Thin' } },
    ]);
  });
});
