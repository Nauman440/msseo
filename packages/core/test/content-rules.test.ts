import { describe, expect, it } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { mainTerm, readability, termDensity } from '../src/audit/content-signals';
import { parsePageContent, type PageContent } from '../src/audit/page-content';

const preflight: AuditData['preflight'] = {
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: { server: 'nginx', 'cf-ray': 'x' }, robotsDirectives: [] },
  variants: [{ url: 'https://example.com/', status: 200 }],
  robots: { found: true, status: 200, body: 'User-agent: *', sitemaps: [], disallowAll: [] },
  sitemaps: [],
  sitemapUrlChecks: [],
  sitemapUrlTotal: 0,
  botAccess: [{ ua: 'googlebot', status: 200 }],
};

const data = (content: PageContent[], over: Partial<AuditData> = {}): AuditData => ({
  url: 'https://example.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '2026-11-16T00:00:00Z',
  preflight, summary: null, pages: [], psi: null, content, ...over,
});

const words = (n: number, w = 'cooling') => Array.from({ length: n }, (_, i) => (i % 10 === 9 ? `${w}.` : w)).join(' ');

const GOOD_HOME = `<!doctype html><html lang="en"><head><title>AC Repair Dallas | Example Heating and Air</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="Fast AC repair in Dallas.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","telephone":"+1 (214) 555-0100","address":{"streetAddress":"12 Main Street"}}</script>
</head><body><header><nav><a href="/about/">About us</a><a href="tel:+12145550100">(214) 555-0100</a></nav></header>
<main><h1>AC repair you can trust</h1><p>${words(50, 'repair')}</p>
<h2>Our services</h2><ul><li>Repair</li></ul><p>Read our customer reviews and testimonials.</p>
<form><input name="name"><input name="phone"><textarea name="msg"></textarea></form></main>
<footer>Licensed and insured. 12 Main Street, Dallas. Call (214) 555-0100. Our technicians have 20 years experience.</footer></body></html>`;

const BAD_PAGE = `<html><head><title>Welcome to our website home</title></head><body>
<h3>Call now</h3><h1>Hello</h1><p>Short intro.</p>
<p>Copyright 2019 deals. Best viagra prices here.</p>
<a href="/x">click here</a><a href="/y">read more</a><a href="/z">here</a>
<img src="/wp-content/uploads/IMG_1234.jpg"><iframe src="https://www.youtube.com/embed/abc"></iframe>
</body></html>`;

const ids = (d: AuditData) => Object.fromEntries(evaluateRules(d).map((r) => [r.def.id, r.result]));

describe('page content parsing', () => {
  it('reads headings, links, schema, forms and the direct-answer paragraph', () => {
    const c = parsePageContent(GOOD_HOME, 'https://example.com/');
    expect(c.h1).toEqual(['AC repair you can trust']);
    expect(c.viewport).toBe(true);
    expect(c.schemaTypes).toContain('LocalBusiness');
    expect(c.telLinks).toBe(1);
    expect(c.forms).toEqual([{ fields: 3 }]);
    expect(c.links.find((l) => l.href.endsWith('/about/'))).toMatchObject({ internal: true, inNav: true });
    expect(c.firstParagraph?.split(' ').length).toBe(50);
    // nav/footer are not main content
    expect(c.text).not.toContain('Licensed');
    expect(c.fullText).toContain('Licensed');
  });

  it('derives the main term from the slug, or the H1 on the homepage', () => {
    expect(mainTerm(parsePageContent('<h1>x</h1>', 'https://example.com/services/ac-repair/'))).toEqual(['repair']);
    expect(mainTerm(parsePageContent('<h1>Furnace installation</h1>', 'https://example.com/'))).toEqual(['furnace', 'installation']);
  });

  it('measures density and readability', () => {
    expect(termDensity('ac repair is ac repair', ['repair']).count).toBe(2);
    expect(readability('Short.')).toBeNull();
    expect(readability(words(120, 'cat'))!.flesch).toBeGreaterThan(50);
  });
});

describe('content, trust and site rules', () => {
  it('passes a well-built homepage', () => {
    const r = ids(data([parsePageContent(GOOD_HOME, 'https://example.com/')]));
    expect(r['1.9.1']?.status).toBe('pass');
    expect(r['2.7.1']?.status).toBe('pass');
    expect(r['2.7.2']?.status).toBe('pass');
    expect(r['2.7.3']?.status).toBe('pass');
    expect(r['2.7.6']?.status).toBe('pass');
    expect(r['2.8.1']?.status).toBe('pass');
    expect(r['2.8.4']?.status).toBe('pass');
    expect(r['1.11.4']?.status).toBe('pass');
    expect(r['1.10.4']?.status).toBe('pass');
    expect(r['1.10.5']).toMatchObject({ status: 'info', metrics: { cdn: 'Cloudflare', server: 'nginx' } });
  });

  it('flags a poorly built page', () => {
    const r = ids(data([parsePageContent(BAD_PAGE, 'https://example.com/services/')]));
    expect(r['1.9.1']?.status).toBe('fail');
    expect(r['2.3.3']?.status).toBe('warn'); // H3 before H1
    expect(r['2.3.5']?.status).toBe('warn'); // "Call now" heading
    expect(r['2.4.10']?.status).toBe('pass'); // old year only in body, not title/headings
    expect(r['2.5.1']?.status).toBe('warn');
    expect(r['2.5.5']?.status).toBe('warn');
    expect(r['1.10.4']?.status).toBe('fail');
    expect(r['2.6.2']?.status).toBe('warn');
    expect(r['2.7.2']?.status).toBe('fail');
    expect(r['2.8.2']?.status).toBe('warn');
    expect(r['1.12.4']?.status).toBe('warn');
  });

  it('flags outdated years in headings and NAP mismatches', () => {
    const old = parsePageContent('<html><head><title>Best AC deals 2019</title></head><body><h1>AC deals</h1></body></html>', 'https://example.com/deals/');
    const nap = parsePageContent(
      '<html><head><script type="application/ld+json">{"@type":"LocalBusiness","telephone":"214-555-0100"}</script></head><body><p>Call 469 555 9999 today</p></body></html>',
      'https://example.com/',
    );
    const r = ids(data([old, nap]));
    expect(r['2.4.10']?.status).toBe('warn');
    expect(r['1.11.4']?.status).toBe('fail');
    expect(r['1.11.3']?.status).toBe('warn');
  });

  it('warns about JS sites audited without rendering and validates hreflang', () => {
    const spa = parsePageContent('<html><head><link rel="alternate" hreflang="english" href="/en/"></head><body><div id="__next"></div><script id="__NEXT_DATA__">{}</script></body></html>', 'https://example.com/');
    const r = ids(data([spa]));
    expect(r['1.1.3']?.status).toBe('warn');
    expect(r['1.13.1']?.status).toBe('fail');
    // hreflang rule is not shown on sites without hreflang
    expect(ids(data([parsePageContent(GOOD_HOME, 'https://example.com/')]))['1.13.1']).toBeUndefined();
  });

  it('skips page rules when no page HTML could be read', () => {
    const r = ids(data([]));
    expect(r['2.8.1']).toBeUndefined();
    expect(r['1.9.1']).toBeUndefined();
    expect(r['1.3.1']?.status).toBe('info');
  });
});
