import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { runTemplateLighthouse } from '../src/audit/lighthouse';
import { parsePageContent } from '../src/audit/page-content';
import { buildTemplates, cityOf, classifyPage, inlinksFromContent } from '../src/audit/templates';
import type { PageSpeedResult } from '../src/providers/pagespeed';

const U = (p: string) => `https://example.com${p}`;

describe('page templates', () => {
  it('classifies pages by URL, then schema', () => {
    expect(classifyPage(U('/'))).toBe('home');
    expect(classifyPage(U('/services/ac-repair/'))).toBe('service');
    expect(classifyPage(U('/furnace-installation/'))).toBe('service');
    expect(classifyPage(U('/areas/plano/'))).toBe('location');
    expect(classifyPage(U('/dallas/'))).toBe('location');
    expect(classifyPage(U('/ac-repair-dallas/'))).toBe('service_location');
    expect(classifyPage(U('/blog/'))).toBe('blog_index');
    expect(classifyPage(U('/blog/winter-tips/'))).toBe('blog_post');
    expect(classifyPage(U('/2024/05/news-item/'))).toBe('blog_post');
    expect(classifyPage(U('/contact-us/'))).toBe('contact');
    expect(classifyPage(U('/privacy-policy/'))).toBe('legal');
    expect(classifyPage(U('/tag/ac/'))).toBe('category');
    expect(classifyPage(U('/why-us/'))).toBe('other');
    const article = parsePageContent('<script type="application/ld+json">{"@type":"BlogPosting"}</script>', U('/why-us/'));
    expect(classifyPage(U('/why-us/'), article)).toBe('blog_post');
  });

  it('reads the city from location URLs', () => {
    expect(cityOf(U('/areas/fort-worth/'))).toBe('fort worth');
    expect(cityOf(U('/ac-repair-dallas/'))).toBe('dallas');
    expect(cityOf(U('/services/'))).toBeUndefined();
  });

  it('picks the most-linked page per template and orders templates by priority', () => {
    const pages = ['/', '/blog/a/', '/services/heating/', '/services/ac-repair/', '/products/x/', '/products/y/'].map((p) => ({ url: U(p) }));
    const t = buildTemplates(pages, new Map([[U('/services/heating/'), 5], [U('/services/ac-repair/'), 2]]));
    expect(t.map((x) => x.label)).toEqual(['Homepage', 'Service pages', 'Blog posts', 'Other: /products/']);
    expect(t[1]!.representative).toBe(U('/services/heating/'));
    // tie on inlinks → shortest URL
    expect(t[3]!.representative).toBe(U('/products/x/'));
  });

  it('counts inlinks as distinct linking pages', () => {
    const home = parsePageContent('<a href="/a/">a</a><a href="/a/">again</a><a href="/b/">b</a>', U('/'));
    const a = parsePageContent('<a href="/b/">b</a><a href="/">home</a>', U('/a/'));
    const b = parsePageContent('<p>x</p>', U('/b/'));
    const m = inlinksFromContent([home, a, b]);
    expect(m.get(U('/a/'))).toBe(1);
    expect(m.get(U('/b/'))).toBe(2);
    expect(m.get(U('/'))).toBe(1);
  });
});

describe('Lighthouse per template', () => {
  afterEach(() => vi.unstubAllGlobals());

  const psiJson = (score: number) => ({ lighthouseResult: { categories: { performance: { score } }, audits: { 'largest-contentful-paint': { numericValue: 2000 } } } });

  it('runs mobile + desktop per representative, reuses the homepage mobile run, and keeps the budget', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const u = new URL(input);
      calls.push(`${u.searchParams.get('url')} ${u.searchParams.get('strategy')}`);
      if (u.searchParams.get('url')!.includes('/slow/')) await new Promise((r) => setTimeout(r, 400));
      return new Response(JSON.stringify(psiJson(u.searchParams.get('strategy') === 'desktop' ? 0.9 : 0.6)), { status: 200 });
    });
    const homeMobile: PageSpeedResult = { strategy: 'mobile', url: U('/'), performance: 41, field: null, lab: {}, renderBlockingMs: null };
    const templates = buildTemplates([U('/'), U('/services/ac-repair/'), U('/slow/')].map((url) => ({ url })), new Map());
    const runs = await runTemplateLighthouse(templates, { key: 'k', homeMobile: Promise.resolve(homeMobile), homeUrl: U('/'), budgetMs: 200, timeoutMs: 1000, retries: 0 });
    expect(calls).not.toContain(`${U('/')} mobile`);
    expect(runs[0]).toMatchObject({ label: 'Homepage', mobile: { performance: 41 }, desktop: { performance: 90 } });
    expect(runs[1]).toMatchObject({ label: 'Service pages', mobile: { performance: 60 }, desktop: { performance: 90 } });
    // The slow page ran out of budget: reported, but without scores.
    expect(runs[2]).toMatchObject({ label: 'Other: /slow/', mobile: null, desktop: null });
  });
});

describe('template rules', () => {
  const preflight: AuditData['preflight'] = {
    origin: 'https://example.com',
    homepage: { url: U('/'), status: 200, finalUrl: U('/'), headers: {}, robotsDirectives: [] },
    variants: [], robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] }, sitemaps: [], sitemapUrlChecks: [], sitemapUrlTotal: 0, botAccess: [],
  };
  const body = (city: string) => `<p>${Array.from({ length: 160 }, (_, i) => `word${i % 50}`).join(' ')} ${city}</p>`;

  it('flags missing cities, copied area pages, missing cross-links, nav gaps, short outliers and mixed URL patterns', () => {
    const home = parsePageContent('<nav><a href="/services/ac-repair/">AC</a></nav>', U('/'));
    const svc = parsePageContent(`<title>AC repair</title><main>${body('')}<a href="/areas/plano/">Plano</a></main>`, U('/services/ac-repair/'));
    const svc2 = parsePageContent(`<title>Heating</title><main><p>${Array.from({ length: 400 }, () => 'heat').join(' ')}</p></main>`, U('/heating-repair/'));
    const svc3 = parsePageContent(`<title>Furnace</title><main><p>${Array.from({ length: 380 }, () => 'warm').join(' ')}</p></main>`, U('/services/furnace/'));
    const plano = parsePageContent(`<title>AC service in Plano</title><main>${body('')}</main>`, U('/areas/plano/'));
    const frisco = parsePageContent(`<title>AC service near you</title><main>${body('')}</main>`, U('/areas/frisco/'));
    const content = [home, svc, svc2, svc3, plano, frisco];
    const templates = buildTemplates(content.map((c) => ({ url: c.url, content: c })), inlinksFromContent(content));
    const r = Object.fromEntries(
      evaluateRules({ url: U('/'), pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: null, content, templates }).map((x) => [x.def.id, x.result]),
    );
    expect(r['2.1.5']).toMatchObject({ status: 'warn', affectedCount: 1, examples: [{ url: U('/areas/frisco/') }] });
    expect(r['2.9.2']).toMatchObject({ status: 'fail', affectedCount: 2 });
    expect(r['2.6.1']?.status).toBe('warn');
    expect(r['1.12.3']?.status).toBe('warn');
    expect(r['2.4.1']).toMatchObject({ status: 'warn', affectedCount: 1, examples: [{ url: U('/services/ac-repair/') }] });
    expect(r['1.7.2']?.status).toBe('warn'); // /services/ and root-level service pages
  });

  it('uses every template run for 1.8.2', () => {
    const ps = (performance: number): PageSpeedResult => ({ strategy: 'mobile', url: '', performance, field: null, lab: {}, renderBlockingMs: null });
    const r = evaluateRules({
      url: U('/'), pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: ps(70),
      lighthouse: [
        { label: 'Homepage', type: 'home', url: U('/'), pages: 1, mobile: ps(70), desktop: ps(95) },
        { label: 'Service pages', type: 'service', url: U('/services/x/'), pages: 4, mobile: ps(45), desktop: ps(80) },
      ],
    }).find((x) => x.def.id === '1.8.2')!.result;
    expect(r).toMatchObject({ status: 'fail', affectedCount: 2, metrics: { lowest: 45, runs: 4 } });
  });
});
