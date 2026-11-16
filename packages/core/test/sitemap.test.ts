import { describe, expect, it } from 'vitest';
import type { AuditData } from '../src';
import { parsePageContent } from '../src/audit/page-content';
import { correctedSitemapUrls, sitemapXml } from '../src/report/sitemap';

const U = (p: string) => `https://example.com${p}`;

describe('corrected sitemap', () => {
  it('drops broken, redirected, noindex and canonicalised URLs and adds missing indexable pages', () => {
    const data = {
      preflight: {
        sitemaps: [{ url: U('/sitemap.xml'), status: 200, valid: true, isIndex: false, urls: [U('/'), U('/old/'), U('/moved/'), U('/hidden/'), U('/dupe/'), U('/unchecked/')] }],
        sitemapUrlChecks: [{ url: U('/old/'), status: 404 }, { url: U('/moved/'), status: 301, location: U('/new/') }],
      },
      pages: [],
      content: [
        parsePageContent('<p>x</p>', U('/')),
        parsePageContent('<meta name="robots" content="noindex">', U('/hidden/')),
        parsePageContent('<link rel="canonical" href="https://example.com/">', U('/dupe/')),
        parsePageContent('<p>new page</p>', U('/new/')),
      ],
    } as unknown as AuditData;
    expect(correctedSitemapUrls(data)).toEqual({ urls: [U('/'), U('/unchecked/'), U('/new/')], removed: 4, added: 1 });
  });

  it('writes valid, escaped XML', () => {
    const xml = sitemapXml(['https://example.com/?a=1&b=2']);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://example.com/?a=1&amp;b=2</loc>');
  });
});
