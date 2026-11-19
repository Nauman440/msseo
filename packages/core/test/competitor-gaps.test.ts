import { describe, expect, it } from 'vitest';
import {
  aheadRows, altFromFileName, dailyChecks, draftAltTexts, emptyKeywordWorkspace, emptyMonitor, hashText, imagesMissingAlt, missingEntities, mixOf, queryKeywords, researchKeywords, weeklyRun,
  type KeywordClient,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Closing the partial points 4.2.6, 6.1.5, 6.2.4, 6.4.3 and the Module 2 / Module 6 "Automate" lines. */
const m = (term: string, volume: number) => ({ term, volume, trend: null, trendFrom: null, difficulty: 20, cpc: 4, intent: 'commercial' as const, position: null, url: null });

describe('4.2.6 keywords from the competitors\' top pages', () => {
  it('mines the strongest pages and remembers the page; the table can filter them', async () => {
    const client = {
      async rankedKeywords(target: string) {
        if (target === 'myhvac.com') return { cost: 0.01, keywords: [] };
        return {
          cost: 0.01,
          keywords: [
            { ...m('furnace repair dallas', 900), position: 2, url: 'https://rival.com/furnace/' },
            { ...m('furnace tune up dallas', 300), position: 4, url: 'https://rival.com/furnace/' },
            { ...m('about rival', 10), position: 1, url: 'https://rival.com/about/' },
          ],
        };
      },
      keywordGap: async () => ({ cost: 0.01, keywords: [] }),
      overview: async (terms: string[]) => ({ cost: 0.01, keywords: terms.map((t) => m(t, 100)) }),
      suggestions: async () => ({ cost: 0, keywords: [] }),
      autocomplete: async () => ({ cost: 0, suggestions: [] }),
    } as unknown as KeywordClient;
    const ws = emptyKeywordWorkspace('myhvac.com', { seeds: { services: ['furnace repair'], locations: ['Dallas'] } });
    const r = await researchKeywords(client, ws, { competitors: ['rival.com'] });
    const by = Object.fromEntries(r.workspace.keywords.map((k) => [k.term, k]));
    expect(by['furnace repair dallas']?.fromPages).toEqual(['https://rival.com/furnace/']);
    expect(by['furnace tune up dallas']).toMatchObject({ sources: ['competitor'], fromPages: ['https://rival.com/furnace/'] });
    expect(queryKeywords(r.workspace, { from: 'pages', show: 'all' }).rows.map((x) => x.term).sort()).toEqual(['about rival', 'furnace repair dallas', 'furnace tune up dallas']);
  });
});

describe('Module 6 partial points', () => {
  it('6.1.5 searches you both rank for where you are higher', () => {
    const rows = aheadRows(new Map([
      ['rival.com', [{ term: 'ac repair', volume: 900, own: 2, rival: 5 }, { term: 'hvac', volume: 5000, own: 9, rival: 3 }, { term: 'furnace', volume: 300, own: 1, rival: null }]],
      ['big.com', [{ term: 'ac repair', volume: 900, own: 2, rival: 8 }]],
    ]));
    expect(rows).toEqual([{ keyword: 'ac repair', volume: 900, position: 2, behind: [{ domain: 'rival.com', position: 5 }, { domain: 'big.com', position: 8 }] }]);
  });

  it('6.2.4 names the ranking pages mention and yours does not', () => {
    const rival = (body: string, url: string) => parsePageContent(`<html><body><main><p>${body}</p></main></body></html>`, url);
    const you = rival('We fix all brands of air conditioner, including Carrier units, fast.', 'https://myhvac.com/ac/');
    const r1 = rival('Our technicians are NATE certified and we install Carrier and Trane systems. We are an EPA approved Rival Heating partner.', 'https://rival.com/ac/');
    const r2 = rival('Every engineer is NATE certified. We repair Trane, Lennox and Carrier units across Dallas County.', 'https://big.com/ac/');
    expect(missingEntities(you, [r1, r2], ['rival', 'Rival Heating'])).toEqual(['NATE', 'Trane']);
  });

  it('6.4.3 anchor mix shares', () => {
    expect(mixOf([{ domains: 3, kind: 'brand' }, { domains: 1, kind: 'exact' }])).toMatchObject({ brand: 75, exact: 25, generic: 0 });
  });
});

describe('Module 2 "Automate": alt-text drafts', () => {
  const p = parsePageContent(
    '<html><head><title>AC repair Dallas</title></head><body><h1>AC repair</h1><img src="/img/ac-unit-install-dallas.jpg"><img src="/img/IMG_1234.jpg"><img src="/logo.svg"><img src="/x.png" alt=""><img src="/y.jpg" alt="Van"><img src="data:image/png;base64,AAA"></body></html>',
    'https://myhvac.com/ac/',
  );
  it('lists content images without alt (not decorative, icons or data URIs)', () => {
    expect(imagesMissingAlt([p]).map((i) => i.src)).toEqual(['https://myhvac.com/img/ac-unit-install-dallas.jpg', 'https://myhvac.com/img/IMG_1234.jpg']);
    expect(altFromFileName('https://x.com/ac-unit-install-dallas-1024x768.jpg')).toBe('Ac unit install dallas');
    expect(altFromFileName('https://x.com/IMG_1234.jpg')).toBeNull();
    expect(altFromFileName('https://x.com/3f9a2b7c1d4e5f60.png')).toBeNull();
  });
  it('drafts from file names without AI, and from the AI answer with it', async () => {
    const items = imagesMissingAlt([p]);
    expect((await draftAltTexts(null, items, 'local service business')).drafts).toEqual([{ page: 'https://myhvac.com/ac/', src: items[0]!.src, alt: 'Ac unit install dallas', by: 'file name' }]);
    const ai = { generateJson: async () => ({ data: { images: [{ n: 0, alt: 'Technician installing an outdoor AC unit' }, { n: 1, alt: 'Service van outside a house' }] }, model: 'x', tokens: 300 }) };
    const r = await draftAltTexts(ai as never, items, 'local service business');
    expect(r.drafts.map((d) => [d.alt, d.by])).toEqual([['Technician installing an outdoor AC unit', 'ai'], ['Service van outside a house', 'ai']]);
    expect(r.tokens).toBe(300);
  });
});

describe('Module 6 "Automate": competitor alerts', () => {
  it('alerts on new pages in a competitor sitemap and on a burst of new linking sites', async () => {
    const ws = emptyMonitor('myhvac.com');
    let urls = ['https://rival.com/', 'https://rival.com/ac/'];
    const deps = () => ({ score: 70, aiShare: null, competitors: [{ domain: 'rival.com', sitemapUrls: async () => urls, newLinkingSites: async () => ({ count: 4, cost: 0.02 }) }] });
    const first = await weeklyRun(ws, deps(), new Date('2026-11-09T10:00:00Z'));
    // First week: the sitemap is remembered (no "new pages" alert); 4 new linking sites is worth knowing.
    expect(first.raised.map((a) => a.title)).toEqual(['rival.com gained 4 new linking websites this week']);
    expect(ws.state.rivals?.['rival.com']?.pages).toEqual(urls.map(hashText));
    urls = [...urls, 'https://rival.com/heat-pumps/', 'https://rival.com/blog/new-post/'];
    const second = await weeklyRun(ws, deps(), new Date('2026-11-16T10:00:00Z'));
    expect(second.raised.map((a) => [a.title, a.detail])).toEqual([['rival.com published 2 new pages', '/heat-pumps/ · /blog/new-post/']]);
    expect(second.cost).toBe(0.02);
    void dailyChecks;
  });
});
