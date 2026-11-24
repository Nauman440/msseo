import { describe, expect, it } from 'vitest';
import { evaluateRules, markDuplicates, pickPages, type AuditData } from '../src';
import type { OnPagePage } from '../src/providers/dataforseo';
import { internalLinks } from '../src/providers/direct-fetch';

const page = (url: string, meta: OnPagePage['meta'] = {}, extra: Partial<OnPagePage> = {}): OnPagePage => ({
  resource_type: 'html',
  url,
  status_code: 200,
  click_depth: 0,
  checks: {},
  meta: { content: { plain_text_word_count: 500 }, htags: { h1: ['H'] }, ...meta },
  ...extra,
});

describe('quick audit', () => {
  it('extracts same-site page links from homepage HTML, skipping files and admin paths', () => {
    const html = `
      <a href="/services/">Services</a><a href='https://www.example.com/about#team'>About</a>
      <a href="https://other.com/x">Other</a><a href="/logo.png">Img</a><a href="/wp-admin/">Admin</a>
      <a href="mailto:hi@example.com">Mail</a><a href="/services/">Dup</a>`;
    expect(internalLinks(html, 'https://example.com/')).toEqual(['https://example.com/services/', 'https://www.example.com/about']);
  });

  it('picks the homepage first, then nav links, then sitemap URLs, without duplicates or other hosts', () => {
    const picked = pickPages(
      {
        homepage: { status: 200, finalUrl: 'https://example.com/', base: 'https://example.com/' },
        candidates: ['https://example.com/', 'https://www.example.com/a', 'https://example.com/a/', 'https://cdn.other.com/b', 'https://example.com/c', 'https://example.com/d'],
      },
      3,
    );
    expect(picked).toEqual(['https://example.com/', 'https://www.example.com/a', 'https://example.com/c']);
  });

  it('flags duplicate titles and descriptions within the checked pages', () => {
    const pages = [page('https://e.com/1', { title: 'Same', description: 'A' }), page('https://e.com/2', { title: ' same ', description: 'B' }), page('https://e.com/3', { title: 'Other' })];
    markDuplicates(pages);
    expect(pages.map((p) => p.duplicate_title)).toEqual([true, true, false]);
    expect(pages.map((p) => p.duplicate_description)).toEqual([false, false, false]);
  });

  it('skips crawl-only rules instead of reporting them as passed', () => {
    const data: AuditData = {
      url: 'https://e.com/',
      pageLimit: 10,
      jsRendering: false,
      mode: 'quick',
      crawledAt: '2026-11-16T00:00:00Z',
      preflight: {
        origin: 'https://e.com',
        homepage: { url: 'https://e.com/', status: 200, finalUrl: 'https://e.com/', headers: {}, robotsDirectives: [] },
        variants: [{ url: 'https://e.com/', status: 200 }],
        robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] },
        sitemaps: [],
        sitemapUrlChecks: [],
        sitemapUrlTotal: 0,
        botAccess: [{ ua: 'googlebot', status: 200 }],
      },
      summary: null,
      pages: [page('https://e.com/', { title: 'Home' })],
      psi: null,
    };
    const quickIds = evaluateRules(data).map((r) => r.def.id);
    for (const id of ['1.5.5', '1.12.1', '1.12.2', '1.12.7', '2.6.3']) expect(quickIds).not.toContain(id);
    expect(quickIds).toContain('2.1.1');
    expect(evaluateRules({ ...data, mode: 'deep' }).map((r) => r.def.id)).toContain('1.12.1');
  });
});
