import { describe, expect, it } from 'vitest';
import {
  calendar, classifyContent, coverage, emptyKeywordWorkspace, entitySignals, historyPoint, judgeAccuracy, readAnswer, robotsAllows, runAeoAudit, runContentAudit, shareOfVoice,
  snippetControls, type ContentInput, type KeywordCluster, type MappingRow, type MappingWorkspace, type ReportPage,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Modules 7 (content audit) and 10 (AI search audit). */
const NOW = new Date('2026-11-19T12:00:00Z');
const page = (path: string, extra: Partial<ReportPage> = {}): ReportPage => ({ url: `https://myhvac.com${path}`, title: null, h1: null, words: 600, pageType: 'service', schemaTypes: [], links: [], ...extra });
const kw = () => {
  const k = emptyKeywordWorkspace('myhvac.com');
  k.seeds = { ...k.seeds, services: ['ac repair', 'furnace repair'], locations: ['Dallas', 'Plano'] };
  k.clusters = [
    { id: 'ac', name: 'Ac repair dallas', head: 'ac repair dallas', priority: 20, seasonalDeadline: '2027-04-01' } as KeywordCluster,
    { id: 'fr', name: 'Furnace repair', head: 'furnace repair', priority: 12, seasonalDeadline: null } as KeywordCluster,
    { id: 'cost', name: 'Ac repair cost', head: 'ac repair cost', priority: 15, seasonalDeadline: null } as KeywordCluster,
  ];
  return k;
};
const mapping = (rows: Partial<MappingRow>[]): MappingWorkspace => ({ domain: 'myhvac.com', builtAt: null, auditId: null, usedSearchConsole: false, rows: rows as MappingRow[] });

describe('content audit (Module 7)', () => {
  const pages = [
    page('/', { pageType: 'home', title: 'MyHVAC Dallas' }),
    page('/services/ac-repair-dallas/', { title: 'AC Repair in Dallas', words: 900 }),
    page('/services/furnace/', { title: 'Furnace repair', words: 180 }),
    page('/old-promo/', { title: 'Spring promo 2019', words: 120, pageType: 'other' }),
    page('/blog/ac-tips/', { pageType: 'blog_post', words: 800 }),
  ];
  const input: ContentInput = {
    domain: 'myhvac.com',
    pages,
    sitemapOnly: ['https://myhvac.com/areas/plano/ac-repair/'],
    gscNow: [
      { page: 'https://myhvac.com/services/ac-repair-dallas/', clicks: 40, impressions: 2000, position: 6 },
      { page: 'https://myhvac.com/services/furnace/', clicks: 5, impressions: 300, position: 12 },
      { page: 'https://myhvac.com/blog/ac-tips/', clicks: 10, impressions: 400, position: 9 },
    ],
    gscPrev: [{ page: 'https://myhvac.com/blog/ac-tips/', clicks: 50 }, { page: 'https://myhvac.com/services/ac-repair-dallas/', clicks: 35 }],
    ga4: [{ path: '/services/ac-repair-dallas', sessions: 300, keyEvents: 12 }],
    duplicates: [],
    keywords: kw(),
    mapping: mapping([
      { clusterId: 'ac', topic: 'Ac repair dallas', url: 'https://myhvac.com/services/ac-repair-dallas/', action: 'optimise', status: 'todo', priority: 20, primaryKeyword: 'ac repair dallas', conflicts: [] },
      { clusterId: 'fr', topic: 'Furnace repair', url: 'https://myhvac.com/services/furnace/', action: 'expand', status: 'todo', priority: 12, primaryKeyword: 'furnace repair', conflicts: [] },
      { clusterId: 'cost', topic: 'Ac repair cost', url: null, action: 'create', status: 'todo', priority: 15, primaryKeyword: 'ac repair cost', conflicts: [], volume: 260, newPageNote: 'Guide with a price range table' },
    ]),
    analysis: null,
  };

  it('classifies every page and finds decay', () => {
    const rows = classifyContent(input);
    const by = Object.fromEntries(rows.map((r) => [new URL(r.url).pathname, r]));
    expect(by['/old-promo/']).toMatchObject({ verdict: 'remove', clicks: 0 });
    expect(by['/blog/ac-tips/']).toMatchObject({ verdict: 'improve', change: -80, prevClicks: 50 });
    expect(by['/services/furnace/']!.verdict).toBe('improve');
    expect(by['/services/ac-repair-dallas/']).toMatchObject({ verdict: 'improve', conversions: 12, sessions: 300 });
    expect(by['/']!.verdict).toBe('keep');
    expect(by['/areas/plano/ac-repair/']).toMatchObject({ inSitemapOnly: true });
  });

  it('without Search Console, thin service pages are still "improve"; about pages never fill the coverage grid', () => {
    const rows = classifyContent({ ...input, gscNow: null, gscPrev: null, ga4: null, mapping: null });
    const by = Object.fromEntries(rows.map((r) => [new URL(r.url).pathname, r]));
    expect(by['/services/furnace/']).toMatchObject({ verdict: 'improve', reason: expect.stringContaining('Only 180 words') });
    expect(by['/old-promo/']!.verdict).toBe('improve');
    const about = [page('/company/', { pageType: 'about', title: 'About us: plumbing and heating in Dallas', words: 250 })];
    expect(classifyContent({ ...input, pages: about, sitemapOnly: [], gscNow: null, gscPrev: null, ga4: null, mapping: null })[0]!.verdict).toBe('keep');
    expect(coverage(['plumbing'], ['Dallas'], about, [])!.cells[0]!.url).toBeNull();
  });

  it('builds coverage, calendar and the whole audit (no AI)', async () => {
    const c = coverage(['ac repair', 'furnace repair'], ['Dallas', 'Plano'], input.pages, input.sitemapOnly)!;
    expect(c.cells.filter((x) => x.url).map((x) => `${x.service}/${x.place}`)).toEqual(['ac repair/Dallas', 'ac repair/Plano']);
    const cal = calendar(input.keywords, input.mapping, NOW);
    expect(cal[0]).toMatchObject({ month: '2026-11', topic: 'Ac repair cost', action: 'Write a new page' });
    expect(cal.find((x) => x.topicId === 'ac')).toMatchObject({ month: '2027-03', why: 'Live by 2027-04 (busy season)' });
    const a = await runContentAudit(input, {}, NOW);
    expect(a.counts).toEqual({ keep: 2, improve: 3, merge: 0, remove: 1 });
    expect(a.decay.map((r) => new URL(r.url).pathname)).toEqual(['/blog/ac-tips/']);
    expect(a.topicGap).toEqual([{ topic: 'Ac repair cost', source: 'no-page', detail: '260 searches a month, no page yet (Guide with a price range table)' }]);
    expect(a.pillars.map((p) => [p.service, p.clusters.length])).toEqual([['ac repair', 2], ['furnace repair', 1]]);
    expect(a.notes.join(' ')).toContain('AI is not set up');
  });
});

describe('AI search audit (Module 10)', () => {
  it('reads robots.txt per AI crawler', () => {
    const robots = 'User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\nAllow: /$\n';
    expect(robotsAllows(robots, 'Googlebot')).toEqual({ allowed: true, rule: null });
    expect(robotsAllows(robots, 'GPTBot')).toEqual({ allowed: false, rule: 'Disallow: /' });
    expect(robotsAllows(robots, 'CCBot').allowed).toBe(false);
    expect(robotsAllows(robots, 'PerplexityBot')).toEqual({ allowed: true, rule: 'Allow: /$' });
    expect(robotsAllows(null, 'GPTBot').allowed).toBe(true);
  });

  const brands = [{ domain: 'myhvac.com', name: 'MyHVAC Heating', you: true }, { domain: 'rival-air.com', name: 'Rival Air', you: false }];
  it('counts mentions and share of voice', () => {
    const a1 = readAnswer('chatgpt', 'q1', { text: 'Try Rival Air or MyHVAC Heating.', citations: [{ url: 'https://www.yelp.com/x', title: null }] }, brands);
    const a2 = readAnswer('perplexity', 'q1', { text: 'Rival Air is popular.', citations: [{ url: 'https://rival-air.com/', title: null }] }, brands);
    const a3 = readAnswer('google', 'q1', null, brands);
    expect(a1).toMatchObject({ mentioned: ['myhvac.com', 'rival-air.com'], cited: ['yelp.com'] });
    expect(a3).toMatchObject({ shown: false, mentioned: [] });
    const s = shareOfVoice([a1, a2, a3], brands);
    expect(s.all).toEqual([{ domain: 'rival-air.com', you: false, mentions: 2, share: 66.7 }, { domain: 'myhvac.com', you: true, mentions: 1, share: 33.3 }]);
    expect(historyPoint(s, NOW)).toMatchObject({ date: '2026-11-19', you: 33.3, byAssistant: { chatgpt: 50, perplexity: 0 } });
  });

  it('checks entity signals, snippet controls and accuracy', async () => {
    const home = parsePageContent('<html><head><meta name="robots" content="max-snippet:20"><script type="application/ld+json">{"@type":"HVACBusiness","name":"MyHVAC Heating","sameAs":["https://facebook.com/myhvac","https://www.linkedin.com/company/myhvac"]}</script></head><body><a href="https://facebook.com/myhvac">fb</a><a href="https://instagram.com/myhvac">ig</a><p data-nosnippet>Prices</p></body></html>', 'https://myhvac.com/');
    const e = entitySignals(home, 'MyHVAC Heating', null, ['https://myhvac.com/about/']);
    expect(e.filter((x) => x.ok).map((x) => x.id)).toEqual(['name', 'schema', 'sameas', 'social', 'about']);
    expect(snippetControls([home]).map((c) => c.issue)).toEqual(['meta robots "max-snippet:20": very short snippets only', '1 part marked data-nosnippet']);
    const j = await judgeAccuracy('MyHVAC Heating (myhvac.com) can be reached at 214-555-0199.', { name: 'MyHVAC Heating', website: 'myhvac.com', phone: '+1 214 555 0100', address: null, services: [], places: [], rating: null }, null);
    expect(j.rows).toEqual([{ topic: 'Website', aiSays: 'myhvac.com', actual: 'myhvac.com', ok: true }, { topic: 'Phone', aiSays: '2145550199', actual: '+1 214 555 0100', ok: false }]);
  });

  it('runs the audit with fake assistants', async () => {
    const answer = (text: string) => async () => ({ cost: 0.03, answer: { text, citations: [{ url: 'https://www.reddit.com/r/dallas', title: null }] } });
    const a = await runAeoAudit(
      { domain: 'myhvac.com', brands, questions: ['Best AC repair in Dallas?', 'Who fixes furnaces fast?'], locale: { country: 'United States', language: 'en' }, iso: 'US', facts: { name: 'MyHVAC Heating', website: 'myhvac.com', phone: null, address: null, services: [], places: ['Dallas'], rating: null }, issues: null, pages: [], local: null, backlinks: null },
      { chatGpt: answer('MyHVAC Heating and Rival Air'), perplexity: answer('Rival Air'), aiOverview: async () => ({ cost: 0.004, answer: null }), robots: async () => 'User-agent: GPTBot\nDisallow: /', pages: async () => [] },
      NOW,
    );
    expect(a.answers).toHaveLength(6);
    expect(a.share.all.find((s) => s.you)).toMatchObject({ mentions: 2, share: 33.3 });
    expect(a.crawlers.find((c) => c.bot === 'GPTBot')!.allowed).toBe(false);
    expect(a.sources[0]).toEqual({ domain: 'reddit.com', count: 4 });
    expect(a.accuracy?.rows[0]).toMatchObject({ topic: 'Website', ok: false });
    expect(a.costUsd).toBeCloseTo(0.158, 3);
    expect(a.thirdParty.find((t) => t.id === 'forums')!.detail).toContain('reddit.com');
  });
});
