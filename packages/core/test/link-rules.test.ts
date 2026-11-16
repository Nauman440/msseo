import { describe, expect, it } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { isBroken, type LinkCheck } from '../src/audit/link-check';
import { parsePageContent } from '../src/audit/page-content';
import { nearDuplicates } from '../src/audit/rules-links';
import type { OnPagePage } from '../src/providers/dataforseo';

const preflight: AuditData['preflight'] = {
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: {}, robotsDirectives: [] },
  variants: [],
  robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] },
  sitemaps: [],
  sitemapUrlChecks: [],
  sitemapUrlTotal: 0,
  botAccess: [],
};

const ids = (d: Partial<AuditData>) =>
  Object.fromEntries(
    evaluateRules({ url: 'https://example.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: null, ...d }).map((r) => [r.def.id, r.result]),
  );

const link = (url: string, status: number, internal = true): LinkCheck => ({ url, internal, status, from: ['https://example.com/'] });

const text = (seed: string) => Array.from({ length: 150 }, (_, i) => `${seed}${i % 40}`).join(' ');

describe('link and duplicate rules', () => {
  it('treats only real failures as broken', () => {
    expect(isBroken(link('https://x.com/', 403, false))).toBe(false);
    expect(isBroken(link('https://x.com/', 404, false))).toBe(true);
    expect(isBroken(link('https://dead.example/', -1, false))).toBe(true);
    expect(isBroken(link('https://example.com/a', 503))).toBe(true);
    expect(isBroken(link('https://x.com/', 503, false))).toBe(false);
  });

  it('reports broken internal and external links', () => {
    const r = ids({ links: [link('https://example.com/ok', 200), link('https://example.com/gone', 404), link('https://other.com/x', 410, false), link('https://slow.com', 0, false)] });
    expect(r['1.5.7']).toMatchObject({ status: 'fail', affectedCount: 1 });
    expect(r['1.12.5']).toMatchObject({ status: 'fail', affectedCount: 2, applicableCount: 3 });
    expect(r['2.6.4']).toMatchObject({ status: 'fail', affectedCount: 1 });
  });

  it('passes when every link works and skips without link data', () => {
    expect(ids({ links: [link('https://example.com/ok', 200)] })['1.12.5']?.status).toBe('pass');
    expect(ids({})['1.12.5']).toBeUndefined();
  });

  it('finds near-duplicate pages but not canonicalised copies', () => {
    const a = parsePageContent(`<main><p>${text('w')}</p></main>`, 'https://example.com/dallas/');
    const b = parsePageContent(`<main><p>${text('w')}</p></main>`, 'https://example.com/plano/');
    const c = parsePageContent(`<main><p>${text('z')}</p></main>`, 'https://example.com/other/');
    const copy = parsePageContent(`<head><link rel="canonical" href="https://example.com/dallas/"></head><main><p>${text('w')}</p></main>`, 'https://example.com/dallas/?ref=1');
    expect(nearDuplicates([a, b, c, copy]).sort()).toEqual(['https://example.com/dallas/', 'https://example.com/plano/']);
    const r = ids({ content: [a, b, c] });
    expect(r['1.6.6']).toMatchObject({ status: 'fail', affectedCount: 2 });
    expect(r['2.4.7']).toMatchObject({ status: 'fail', affectedCount: 2 });
  });

  it('flags weakly linked key pages only in a deep crawl', () => {
    const p = (url: string, inbound: number, depth = 1): OnPagePage => ({ resource_type: 'html', url, status_code: 200, click_depth: depth, meta: { inbound_links_count: inbound } });
    const pages = [p('https://example.com/', 50, 0), p('https://example.com/ac-repair/', 1), p('https://example.com/heating/', 20), p('https://example.com/a/', 30), p('https://example.com/b/', 25), p('https://example.com/blog/x/', 2, 3)];
    expect(ids({ pages, mode: 'deep' })['2.6.3']).toMatchObject({ status: 'warn', affectedCount: 1 });
    expect(ids({ pages, mode: 'deep' })['1.12.7']).toMatchObject({ status: 'warn', affectedCount: 1 });
    expect(ids({ pages, mode: 'quick' })['2.6.3']).toBeUndefined();
  });
});
