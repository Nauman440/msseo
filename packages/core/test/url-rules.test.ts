import { describe, expect, it } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { parsePageContent } from '../src/audit/page-content';
import { variantsOf } from '../src/audit/url-probes';
import type { OnPagePage } from '../src/providers/dataforseo';

const preflight = (over: Partial<AuditData['preflight']> = {}): AuditData['preflight'] => ({
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: {}, robotsDirectives: [] },
  variants: [
    { url: 'http://example.com/', status: 302, location: 'https://example.com/' },
    { url: 'https://example.com/', status: 200 },
  ],
  robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] },
  sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 200, valid: true, isIndex: false, urls: Array.from({ length: 1200 }, (_, i) => `https://example.com/p${i}/`) }],
  sitemapUrlChecks: [],
  sitemapUrlTotal: 1200,
  botAccess: [],
  ...over,
});

const page = (url: string, status = 200): OnPagePage => ({ resource_type: 'html', url, status_code: status });

const html = (body: string, head = '') => `<html><head>${head}</head><body>${body}</body></html>`;

const ids = (d: Partial<AuditData>) =>
  Object.fromEntries(
    evaluateRules({ url: 'https://example.com/', pageLimit: 3, jsRendering: false, mode: 'quick', crawledAt: '2026-11-16T00:00:00Z', preflight: preflight(), summary: null, pages: [], psi: null, ...d }).map((r) => [r.def.id, r.result]),
  );

describe('URL rules', () => {
  it('builds slash and case variants only for clean inner paths', () => {
    expect(variantsOf('https://example.com/')).toEqual([]);
    expect(variantsOf('https://example.com/a.pdf')).toEqual([]);
    expect(variantsOf('https://example.com/ac-repair/').map((v) => v.variant)).toEqual(['https://example.com/ac-repair', 'https://example.com/AC-REPAIR/']);
  });

  it('records info rules and flags temporary redirects, big flat sitemaps and slash duplicates', () => {
    const r = ids({
      pages: [page('https://example.com/'), page('https://example.com/a/'), page('https://example.com/b/', 307)],
      probes: [{ url: 'https://example.com/a/', variant: 'https://example.com/a', kind: 'slash', status: 200, duplicate: true }],
    });
    expect(r['1.1.1']?.status).toBe('info');
    expect(r['1.1.2']).toMatchObject({ status: 'info', metrics: { checked: 3, sitemap: 1200 } });
    expect(r['1.1.5']?.status).toBe('info');
    expect(r['1.5.4']).toMatchObject({ status: 'warn', affectedCount: 2 });
    expect(r['1.4.5']?.status).toBe('warn');
    expect(r['1.6.4']?.status).toBe('warn');
  });

  it('flags traps, junk links, session params, soft 404s and badly handled archives', () => {
    const links = [
      ...Array.from({ length: 12 }, (_, i) => `<a href="/shop?color=${i}">c</a>`),
      '<a href="/events?month=2026-12">cal</a>',
      '<a href="/tag/ac/">t</a><a href="/author/bob/">a</a><a href="/about?utm_source=nav">u</a>',
      '<a href="/feed/">f</a><a href="/blog/page/2/">2</a><a href="/?replytocom=5">r</a><a href="/?attachment_id=3">i</a>',
    ].join('');
    const home = parsePageContent(html(links), 'https://example.com/');
    const tag = parsePageContent(html('<h1>AC</h1>'), 'https://example.com/tag/ac/');
    const page2 = parsePageContent(html('<h1>Blog</h1>', '<link rel="canonical" href="https://example.com/blog/">'), 'https://example.com/blog/page/2/');
    const soft = parsePageContent(html('<h1>Page not found</h1>'), 'https://example.com/old/');
    const param = parsePageContent(html('<h1>Shop</h1>'), 'https://example.com/shop?color=1');
    const r = ids({ content: [home, tag, page2, soft, param] });
    expect(r['1.2.5']?.status).toBe('warn');
    expect(['warn', 'fail']).toContain(r['1.2.6']?.status);
    expect(r['1.7.3']?.status).toBe('warn');
    expect(r['1.5.6']).toMatchObject({ status: 'warn', affectedCount: 1 });
    expect(r['1.3.5']?.status).toBe('warn');
    expect(r['1.6.7']?.status).toBe('warn');
    expect(r['1.6.5']?.status).toBe('warn');
  });

  it('flags sitemap URLs that are noindex or canonicalised elsewhere', () => {
    const hidden = parsePageContent(html('<h1>x</h1>', '<meta name="robots" content="noindex">'), 'https://example.com/p1/');
    const fine = parsePageContent(html('<h1>y</h1>', '<link rel="canonical" href="https://example.com/p2/">'), 'https://example.com/p2/');
    expect(ids({ content: [hidden, fine] })['1.4.2']).toMatchObject({ status: 'fail', affectedCount: 1, applicableCount: 2 });
  });
});
