import { describe, expect, it } from 'vitest';
import { answerFormat, freshness, missingTopics, pageDetails, sitemapFolders, topPagesFrom } from '../src/analysis/extras';
import { parsePageContent } from '../src/audit/page-content';

/** Module 6 completion: details compared page by page, site structure, top pages and AI answer formats. */
const NOW = new Date('2026-11-18T12:00:00Z');
const page = (url: string, body: string, head = '') => parsePageContent(`<html><head>${head}</head><body>${body}</body></html>`, url);

describe('page details and missing topics (6.2)', () => {
  it('reads page type, title, H1, images, video, forms, calls, trust, prices and freshness', () => {
    const c = page(
      'https://rival.com/services/ac-repair/',
      '<h1>AC Repair in Dallas</h1><p>Licensed and insured. 4.9 stars from 200 reviews. AC repair from $89. Updated for 2025.</p><img src="a.jpg" alt="van"><img src="b.jpg"><iframe src="https://www.youtube.com/embed/x"></iframe><form><input name="a"><input name="b"></form><a href="tel:+12145550100">Call</a>',
      '<title>AC Repair Dallas | Rival</title><script type="application/ld+json">{"@type":"Service","dateModified":"2026-10-02T09:00:00Z"}</script>',
    );
    expect(pageDetails(c, NOW)).toMatchObject({ title: 'AC Repair Dallas | Rival', h1: 'AC Repair in Dallas', pageType: 'Service page', images: 2, forms: 1, callButtons: 1, trust: ['Reviews', 'Licences or guarantees'], price: true, updated: '2026-10-02' });
    expect(freshness(page('https://x.com/', '<p>Prices for 2019 and 2024. Founded 1998.</p>'), NOW)).toBe('2024');
  });

  it('lists sections the ranking pages have that the client page does not cover', () => {
    const you = page('https://me.com/ac-repair/', '<h1>AC repair</h1><h2>Why choose us</h2><p>Fast AC repair across Dallas.</p>');
    const rivals = [
      page('https://a.com/ac/', '<h2>AC repair cost</h2><h2>Signs your AC needs repair</h2><h2>Why choose us</h2>'),
      page('https://b.com/ac/', '<h2>How much does AC repair cost?</h2><h2>Signs your AC needs repair</h2>'),
    ];
    const missing = missingTopics(you, rivals);
    expect(missing[0]).toBe('Signs your AC needs repair');
    expect(missing).not.toContain('Why choose us');
    expect(missing.length).toBeGreaterThan(1);
    // No page yet: everything they cover is missing.
    expect(missingTopics(null, rivals)).toContain('Why choose us');
  });
});

describe('structure, top pages and AI answers (6.1.3, 6.3.3, 6.6.3)', () => {
  it('groups a sitemap by folder', () => {
    expect(sitemapFolders(['https://x.com/', 'https://x.com/about/', 'https://x.com/blog/a/', 'https://x.com/blog/b/', 'https://x.com/services/ac/'])).toEqual([
      { folder: '/ (top level)', count: 2 },
      { folder: '/blog/', count: 2 },
      { folder: '/services/', count: 1 },
    ]);
  });

  it('groups ranked keywords into the strongest pages', () => {
    const k = (term: string, url: string, volume: number, position = 3) => ({ term, url, volume, position, trend: null, trendFrom: null, difficulty: null, cpc: null, intent: null });
    const pages = topPagesFrom([k('ac repair', 'https://r.com/ac/', 1000), k('ac repair near me', 'https://r.com/ac/', 500), k('furnace', 'https://r.com/heat/', 800), k('far away', 'https://r.com/x/', 9000, 45)]);
    expect(pages).toEqual([
      { url: 'https://r.com/ac/', volume: 1500, keywords: ['ac repair', 'ac repair near me'] },
      { url: 'https://r.com/heat/', volume: 800, keywords: ['furnace'] },
    ]);
  });

  it('recognises the shape of an AI answer', () => {
    expect(answerFormat('Here are the best:\n1. A\n2. B\n3. C')).toBe('Numbered steps');
    expect(answerFormat('- A\n- B\n- C')).toBe('Bullet list');
    expect(answerFormat('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('Table');
    expect(answerFormat('**Cost**\ntext\n**Timing**\ntext')).toBe('Sections with headings');
    expect(answerFormat('Try Cool Air Dallas.')).toBe('Short answer');
  });
});
