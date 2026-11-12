import { describe, expect, it } from 'vitest';
import { buildReport, evaluateRules, type AuditData } from '../src';
import type { OnPagePage } from '../src/providers/dataforseo';
import { parseRobotsDirectives } from '../src/providers/direct-fetch';

const preflight: AuditData['preflight'] = {
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: { 'strict-transport-security': 'max-age=1' }, robotsDirectives: [] },
  variants: [
    { url: 'http://example.com/', status: 301, location: 'https://example.com/' },
    { url: 'https://example.com/', status: 200 },
  ],
  robots: { found: true, status: 200, body: 'User-agent: *\nDisallow: /wp-admin/', sitemaps: [], disallowAll: ['/wp-admin/'] },
  sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 200, valid: true, isIndex: false, urls: ['https://example.com/', 'https://example.com/old/'] }],
  sitemapUrlChecks: [
    { url: 'https://example.com/', status: 200 },
    { url: 'https://example.com/old/', status: 404 },
  ],
  sitemapUrlTotal: 2,
  botAccess: [
    { ua: 'browser', status: 200 },
    { ua: 'googlebot', status: 200 },
  ],
};

const page = (over: Partial<OnPagePage>): OnPagePage => ({
  resource_type: 'html',
  url: 'https://example.com/',
  status_code: 200,
  click_depth: 0,
  checks: { has_micromarkup: true },
  meta: { title: 'Example title that is exactly the right length for SEO!!', description: 'd'.repeat(150), canonical: 'https://example.com/', htags: { h1: ['Hi'] }, content: { plain_text_word_count: 600 } },
  ...over,
});

const data = (pages: OnPagePage[]): AuditData => ({
  url: 'https://example.com/',
  pageLimit: 10,
  jsRendering: false,
  crawledAt: '2026-11-12T00:00:00Z',
  preflight,
  summary: null,
  pages,
  psi: null,
});

describe('rules engine', () => {
  it('never reports page rules as passed when nothing was crawled', () => {
    const results = evaluateRules(data([]));
    const ids = results.map((r) => r.def.id);
    expect(ids).not.toContain('2.1.1');
    expect(ids).not.toContain('1.5.1');
    // Site-level checks from preflight still run.
    expect(ids).toContain('1.2.1');
  });

  it('flags missing titles, thin content and broken sitemap URLs', () => {
    const results = evaluateRules(
      data([page({}), page({ url: 'https://example.com/a/', meta: { htags: { h1: [] }, content: { plain_text_word_count: 80 } } })]),
    );
    const status = (id: string) => results.find((r) => r.def.id === id)?.result.status;
    expect(status('2.1.1')).toBe('fail');
    expect(status('2.4.9')).toBe('fail');
    expect(status('2.3.1')).toBe('warn');
    expect(status('1.4.3')).toBe('fail');
    expect(status('1.6.3')).toBe('pass');
    expect(results.find((r) => r.def.id === '2.1.1')?.result.affectedCount).toBe(1);
  });

  it('fails 1.3.2 when the homepage is noindex/nofollow', () => {
    const d = data([]);
    d.preflight = { ...preflight, homepage: { ...preflight.homepage, robotsDirectives: ['nofollow', 'noindex'] } };
    const r = evaluateRules(d).find((x) => x.def.id === '1.3.2');
    expect(r?.result.status).toBe('fail');
    expect(r?.result.severity).toBe('critical');
    expect(evaluateRules(data([])).find((x) => x.def.id === '1.3.2')?.result.status).toBe('pass');
  });

  it('parses robots directives from meta tags and X-Robots-Tag', () => {
    expect(parseRobotsDirectives('<meta name="robots" content="nofollow, noindex"/>')).toEqual(['nofollow', 'noindex']);
    expect(parseRobotsDirectives("<meta content='index' name='googlebot'>", 'googlebot: noarchive')).toEqual(['index', 'noarchive']);
    expect(parseRobotsDirectives('<meta name="viewport" content="width=device-width">')).toEqual([]);
  });

  it('builds a report whose score drops with failures and omits CWV without PageSpeed', () => {
    const clean = buildReport(data([page({})]), { auditId: 'a', audience: 'client', brand: 'B' });
    const broken = buildReport(
      data([page({}), page({ url: 'https://example.com/x/', status_code: 404 }), page({ url: 'https://example.com/y/', meta: {} })]),
      { auditId: 'b', audience: 'client', brand: 'B' },
    );
    expect(broken.overall.score).toBeLessThan(clean.overall.score);
    expect(broken.topIssues.length).toBeGreaterThan(0);
    expect(broken.cwv).toBeNull();
    expect(broken.pageHealth.errors).toBeGreaterThan(0);
  });
});
