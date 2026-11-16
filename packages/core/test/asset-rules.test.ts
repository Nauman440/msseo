import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { readInsights, type PageSpeedResult, type PsiInsights } from '../src/providers/pagespeed';

// Lighthouse 13.6 audits from a real PageSpeed run (public HVAC site, query strings removed).
const audits = JSON.parse(readFileSync(new URL('./fixtures/psi-lh13-audits.json', import.meta.url), 'utf8'));

const preflight = (headers: Record<string, string>): AuditData['preflight'] => ({
  origin: 'https://example.com',
  homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers, robotsDirectives: [] },
  variants: [],
  robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] },
  sitemaps: [],
  sitemapUrlChecks: [],
  sitemapUrlTotal: 0,
  botAccess: [],
});

const psi = (insights?: PsiInsights): PageSpeedResult => ({ strategy: 'mobile', url: 'https://example.com/', performance: 60, field: null, lab: {}, renderBlockingMs: 0, insights });

const ids = (p: PageSpeedResult | null, headers: Record<string, string> = {}) =>
  Object.fromEntries(
    evaluateRules({ url: 'https://example.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight: preflight(headers), summary: null, pages: [], psi: p }).map((r) => [r.def.id, r.result]),
  );

describe('Lighthouse 13 insights', () => {
  it('reads image, unused-code, cache, compression, font and third-party insights', () => {
    const i = readInsights(audits);
    expect(i.images?.length).toBe(8);
    expect(i.images?.filter((x) => x.oversized).length).toBe(4);
    expect(i.images?.filter((x) => x.format).length).toBe(3);
    expect(i.unsizedImages).toBe(8);
    expect(i.unusedJsBytes).toBeGreaterThan(100_000);
    expect(i.cacheWastedBytes).toBeGreaterThan(1_000_000);
    expect(i.compression).toBe(true);
    expect(i.fontDisplayMs).toBe(400);
    expect(i.thirdParties?.[0]?.mainThreadMs).toBeGreaterThan(0);
  });

  it('turns the insights into speed and image findings', () => {
    const r = ids(psi(readInsights(audits)), { 'cf-ray': 'x' });
    expect(r['1.8.3']?.status).toBe('warn');
    expect(r['1.8.5']?.status).toBe('warn');
    expect(r['1.8.7']).toMatchObject({ status: 'warn' }); // short cache lifetimes, even behind a CDN
    expect(r['1.8.8']?.status).toBe('warn');
    expect(r['2.5.3']).toMatchObject({ status: 'warn', metrics: { oversized: 4, unsized: 8 } });
  });

  it('passes a lean page and skips without PageSpeed', () => {
    const lean: PsiInsights = { images: [], unsizedImages: 0, unusedJsBytes: 0, unusedCssBytes: 0, unusedMs: 0, cacheWastedBytes: 0, compression: true, fontDisplayMs: 0, thirdParties: [] };
    const r = ids(psi(lean), { 'cf-ray': 'x' });
    for (const id of ['1.8.3', '1.8.5', '1.8.7', '1.8.8', '2.5.3']) expect(r[id]?.status).toBe('pass');
    const none = ids(null);
    for (const id of ['1.8.3', '1.8.5', '1.8.8', '2.5.3']) expect(none[id]).toBeUndefined();
    // 1.8.7 still reports a missing CDN from the response headers alone.
    expect(none['1.8.7']).toMatchObject({ status: 'warn', metrics: { cdn: 'none' } });
  });
});
