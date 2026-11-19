import { describe, expect, it } from 'vitest';
import {
  addOutreach, anchorKind, backlinksToCsv, brokenLinkedUrls, DfsAccessError, emptyBacklinks, linkType, quality, redirectFor, runBacklinkAudit, spikesOf, updateOutreach,
  type BacklinksClient,
} from '../src';

/** Module 8 · Backlink audit. */
const NOW = new Date('2026-11-19T12:00:00Z');
const summary = (referringDomains: number) => ({
  summary: { rank: 25, backlinks: 900, referringDomains, nofollowDomains: 10, spamScore: 8, brokenBacklinks: 3, brokenPages: 1, firstSeen: '2019-01-01', tld: { com: 50 }, countries: {}, attributes: {} },
  cost: 0.02,
});

const fakeClient = (over: Partial<Record<keyof BacklinksClient, unknown>> = {}) => {
  const calls: string[] = [];
  const c = {
    summary: async (t: string) => (calls.push(`summary:${t}`), summary(t === 'myhvac.com' ? 60 : 140)),
    referringDomains: async () => ({ cost: 0.026, domains: [
      { domain: 'dallasnews.com', rank: 55, backlinks: 3, firstSeen: '2024-01-01', spamScore: 2 },
      { domain: 'hvac-parts-blog.net', rank: 12, backlinks: 9, firstSeen: '2025-03-01', spamScore: 10 },
      { domain: 'cheap-links-casino.xyz', rank: 4, backlinks: 40, firstSeen: '2026-10-01', spamScore: 85 },
    ] }),
    anchors: async () => ({ cost: 0.02, anchors: [
      { anchor: 'MyHVAC', backlinks: 20, domains: 10 },
      { anchor: 'ac repair dallas', backlinks: 5, domains: 3 },
      { anchor: 'click here', backlinks: 4, domains: 2 },
      { anchor: 'https://myhvac.com', backlinks: 3, domains: 3 },
      { anchor: 'best furnace tips', backlinks: 2, domains: 2 },
    ] }),
    topPages: async () => ({ cost: 0.02, pages: [{ url: 'https://myhvac.com/', status: 200, title: 'Home', backlinks: 500, domains: 40 }] }),
    newLost: async (t: string) => ({ cost: 0.02, series: t === 'myhvac.com'
      ? [{ date: '2026-09-07', newLinks: 4, lostLinks: 1, newDomains: 2, lostDomains: 0 }, { date: '2026-09-14', newLinks: 400, lostLinks: 0, newDomains: 40, lostDomains: 0 }, { date: '2026-09-21', newLinks: 3, lostLinks: 2, newDomains: 1, lostDomains: 1 }]
      : [{ date: '2026-10-01', newLinks: 30, lostLinks: 2, newDomains: 12, lostDomains: 1 }] }),
    lostLinks: async () => ({ cost: 0.02, links: [{ from: 'https://oldblog.com/post', fromDomain: 'oldblog.com', to: 'https://myhvac.com/', toStatus: 200, anchor: 'MyHVAC', dofollow: true, domainRank: 30, firstSeen: null, lastSeen: '2026-10-10', spamScore: 1 }] }),
    brokenLinks: async () => ({ cost: 0.02, links: [{ from: 'https://dallasnews.com/a', fromDomain: 'dallasnews.com', to: 'https://myhvac.com/old-ac-repair-page/', toStatus: 404, anchor: 'AC repair', dofollow: true, domainRank: 55, firstSeen: null, lastSeen: null, spamScore: 2 }] }),
    linkGap: async (a: string, b: string) => (calls.push(`gap:${a}+${b}`), { cost: 0.03, domains: [{ domain: 'dallaschamber.org', rank: 40 }, { domain: 'dallasnews.com', rank: 55 }] }),
    mentions: async () => ({ cost: 0.02, mentions: [{ url: 'https://localguide.com/best-hvac', domain: 'localguide.com', title: 'Best HVAC in Dallas', date: null, domainRank: 20 }, { url: 'https://dallasnews.com/x', domain: 'dallasnews.com', title: 'x', date: null, domainRank: 55 }, { url: 'https://facebook.com/x', domain: 'facebook.com', title: 'x', date: null, domainRank: 90 }] }),
    ...over,
  };
  return { client: c as unknown as BacklinksClient, calls };
};
const input = { domain: 'myhvac.com', competitors: ['rival-a.com', 'rival-b.com', 'rival-c.com'], brand: 'MyHVAC', keywords: ['ac repair dallas', 'furnace repair'], places: ['Dallas'], countryTld: '.com', pages: ['https://myhvac.com/', 'https://myhvac.com/services/ac-repair/', 'https://myhvac.com/about/'] };

describe('backlink classification', () => {
  it('scores quality, link type, anchors and spikes', () => {
    expect(quality({ rank: 55, spamScore: 2 })).toBe('strong');
    expect(quality({ rank: 12, spamScore: 10 })).toBe('good');
    expect(quality({ rank: 3, spamScore: 0 })).toBe('weak');
    expect(quality({ rank: 70, spamScore: 80 })).toBe('toxic');
    expect(['yelp.com', 'dallasnews.com', 'dallaschamber.org', 'utexas.edu', 'dallascounty.gov', 'facebook.com', 'joes-plumbing.com'].map(linkType)).toEqual(['directory', 'news', 'association', 'education', 'government', 'social', 'business']);
    const brand = ['myhvac'];
    expect(['MyHVAC Dallas', 'ac repair dallas', 'AC repair near you', 'Click here', 'www.myhvac.com', '', 'great company'].map((a) => anchorKind(a, brand, ['ac repair dallas']))).toEqual(['brand', 'exact', 'partial', 'generic', 'url', 'empty', 'other']);
    expect(spikesOf([{ date: 'a', newLinks: 0, lostLinks: 0, newDomains: 2, lostDomains: 0 }, { date: 'b', newLinks: 0, lostLinks: 0, newDomains: 3, lostDomains: 0 }, { date: 'c', newLinks: 0, lostLinks: 0, newDomains: 30, lostDomains: 0 }])).toEqual([{ date: 'c', newDomains: 30 }]);
    expect(redirectFor('https://myhvac.com/old-ac-repair-page/', input.pages, 'https://myhvac.com/')).toBe('https://myhvac.com/services/ac-repair/');
    expect(redirectFor('https://myhvac.com/xyz/', input.pages, 'https://myhvac.com/')).toBe('https://myhvac.com/');
  });
});

describe('backlink audit run', () => {
  it('builds the audit: quality mix, anchors, spikes, broken links with redirects, link gap and unlinked mentions', async () => {
    const { client, calls } = fakeClient();
    const a = await runBacklinkAudit(input, client, NOW);
    expect(a.summary.referringDomains).toBe(60);
    expect(a.quality).toEqual({ strong: 1, good: 1, weak: 0, toxic: 1 });
    expect(a.domains.find((d) => d.domain === 'dallasnews.com')).toMatchObject({ local: true, type: 'news' });
    expect(a.domains.find((d) => d.domain === 'hvac-parts-blog.net')).toMatchObject({ relevant: false, type: 'blog' });
    expect(a.anchorMix.brand).toBe(50);
    expect(a.spikes).toEqual([{ date: '2026-09-14', newDomains: 40 }]);
    expect(a.broken[0]).toMatchObject({ toStatus: 404, suggestion: 'https://myhvac.com/services/ac-repair/' });
    // Gap: three pairs of competitors; a domain already linking to the client is left out.
    expect(calls.filter((c) => c.startsWith('gap:'))).toHaveLength(3);
    expect(a.gap).toEqual([{ domain: 'dallaschamber.org', rank: 40, linksTo: ['rival-a.com', 'rival-b.com', 'rival-c.com'], type: 'association' }]);
    // Mentions on sites that do not link yet (social networks left out).
    expect(a.mentions.map((m) => m.domain)).toEqual(['localguide.com']);
    expect(a.competitors[0]).toMatchObject({ domain: 'rival-a.com', referringDomains: 140, newDomains90: 12 });
    expect(a.costUsd).toBeGreaterThan(0.3);
    expect(brokenLinkedUrls(a)).toEqual(['https://myhvac.com/old-ac-repair-page/']);
  });

  it('stops with a clear error when the Backlinks API is not enabled, and survives single failures', async () => {
    const { client } = fakeClient({ summary: async () => Promise.reject(new DfsAccessError('Backlinks')) });
    await expect(runBacklinkAudit(input, client, NOW)).rejects.toThrow(/not enabled/);
    const partial = fakeClient({ anchors: async () => Promise.reject(new Error('timeout')) });
    const a = await runBacklinkAudit(input, partial.client, NOW);
    expect(a.anchors).toEqual([]);
    expect(a.notes).toContain('Anchor texts could not be read.');
  });

  it('keeps an outreach list with status and exports CSV', () => {
    let ws = addOutreach(emptyBacklinks('myhvac.com'), [{ domain: 'dallaschamber.org', source: 'gap', reason: 'Links to 3 competitors', url: null }], NOW);
    ws = addOutreach(ws, [{ domain: 'dallaschamber.org', source: 'gap', reason: 'again', url: null }], NOW);
    expect(ws.outreach).toHaveLength(1);
    ws = updateOutreach(ws, 'dallaschamber.org', { status: 'contacted', owner: 'Sara', contact: 'info@dallaschamber.org' }, NOW);
    expect(ws.outreach[0]).toMatchObject({ status: 'contacted', owner: 'Sara' });
    expect(backlinksToCsv(ws, 'outreach')).toContain('dallaschamber.org,gap,Links to 3 competitors,,info@dallaschamber.org,Sara,contacted,');
  });
});

describe('backlink audit, closing 6.4.3 and 6.4.5', () => {
  it('reads each competitor\'s anchor mix and most linked pages', async () => {
    const { client } = fakeClient();
    const a = await runBacklinkAudit(input, client, NOW);
    expect(a.competitors[0]!.anchorMix).toBeTruthy();
    expect(Object.values(a.competitors[0]!.anchorMix!).reduce((s, x) => s + x, 0)).toBeCloseTo(100, 0);
    expect(a.competitors[0]!.topPages).toEqual([{ url: 'https://myhvac.com/', status: 200, title: 'Home', backlinks: 500, domains: 40 }]);
  });
});
