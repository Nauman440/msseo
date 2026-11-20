import { describe, expect, it } from 'vitest';
import {
  blogBrief, blogIdeas, buildMapping, emptyKeywordWorkspace, keywordResearchSheets, toXlsx, trafficPotential,
  type KeywordCluster, type KeywordRecord, type KeywordWorkspace, type ReportPage,
} from '../src';

/** The keyword research flow end to end: traffic potential, blog ideas, the final sheet. */
const kw = (term: string, clusterId: string | null, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 100, trend: null, trendFrom: null, difficulty: 20, cpc: 5, intent: 'transactional', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['seed'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId, addedAt: '', ...extra,
});
const cluster = (id: string, head: string, extra: Partial<KeywordCluster> = {}): KeywordCluster => ({
  id, name: head.charAt(0).toUpperCase() + head.slice(1), head, size: 1, intent: 'transactional', pageType: 'service', volume: 500, businessValue: 4, rankingChance: 4,
  scoresLocked: false, priority: 16, bestPosition: null, bestUrl: null, quickWin: false, longTerm: false, seasonalPeak: null, seasonalDeadline: null, ...extra,
});
const page = (path: string, extra: Partial<ReportPage> = {}): ReportPage => ({ url: `https://myhvac.com${path}`, title: null, h1: null, words: 600, pageType: 'service', schemaTypes: [], links: [], ...extra });

describe('traffic potential', () => {
  const top = 'https://rival.com/ac-repair/';
  it('sums volume × click rate at the #1 page’s position in each saved result', () => {
    const head = kw('ac repair', 'ac', { volume: 1000, serpUrls: [top, 'https://b.com/'] });
    const second = kw('ac repair service', 'ac', { volume: 500, serpUrls: ['https://b.com/', top] });
    const absent = kw('ac fix', 'ac', { volume: 300, serpUrls: ['https://c.com/'] });
    const variant = kw('a/c repair', 'ac', { volume: 100 });
    // 1000 × 0.28 + 500 × 0.155 + 0 + 100 × 0.11 (no saved result: counted at position 3)
    expect(trafficPotential(head, [head, second, absent, variant])).toBe(Math.round(280 + 77.5 + 11));
  });
  it('is unknown without a saved result for the head keyword', () => {
    expect(trafficPotential(kw('ac repair', 'ac'), [kw('ac repair', 'ac')])).toBeNull();
  });
});

function workspace(): KeywordWorkspace {
  const ws = emptyKeywordWorkspace('myhvac.com', { country: 'United States', language: 'en', seeds: { services: ['ac repair'], locations: ['Dallas'] } });
  return {
    ...ws,
    keywords: [
      kw('ac repair', 'ac', { volume: 900 }),
      kw('how much does ac repair cost', 'cost', { volume: 300, intent: 'informational' }),
      kw('why is my ac blowing warm air', 'warm', { volume: 200, intent: 'informational' }),
      kw('is ac repair worth it', 'warm', { volume: 50, intent: 'informational' }),
      kw('ac repair jobs', null, { status: 'removed', removeReason: 'Job searches' }),
    ],
    clusters: [
      cluster('ac', 'ac repair', { priority: 20, volume: 900, trafficPotential: 250 }),
      cluster('cost', 'how much does ac repair cost', { intent: 'informational', pageType: 'blog_post', priority: 9, volume: 300 }),
      cluster('warm', 'why is my ac blowing warm air', { intent: 'informational', pageType: 'blog_post', priority: 6, volume: 250, size: 2, seasonalDeadline: '2027-04-01' }),
    ],
    questions: [{ text: 'Why is my AC running but not cooling?', keyword: 'why is my ac blowing warm air' }],
  };
}

describe('blog ideas', () => {
  const kws = workspace();
  const mapping = buildMapping({
    domain: 'myhvac.com', clusters: kws.clusters, keywords: kws.keywords, pages: [page('/services/ac-repair/', { title: 'AC repair in Dallas' })], brand: 'MyHVAC', now: new Date('2026-11-20T00:00:00Z'),
  });
  const ideas = blogIdeas(kws, mapping);

  it('lists learn-about topics without a page, linked to the matching service page', () => {
    expect(ideas.map((i) => i.clusterId)).toEqual(['cost', 'warm']);
    const warm = ideas[1]!;
    expect(warm).toMatchObject({ title: 'Why Is My AC Blowing Warm Air?', path: '/blog/why-is-my-ac-blowing-warm-air/', liveBy: '2027-04-01', linkTo: 'https://myhvac.com/services/ac-repair/' });
    expect(warm.faq).toEqual(['Why is my AC running but not cooling?', 'Is ac repair worth it?']);
  });

  it('gives each idea a writer’s brief', () => {
    const b = blogBrief(ideas[1]!, 'MyHVAC');
    expect(b).toMatchObject({ pageType: 'Article', h1: 'Why Is My AC Blowing Warm Air?', path: '/blog/why-is-my-ac-blowing-warm-air/' });
    expect(b.mustHave).toContain('A link to /services/ac-repair/');
    expect(b.schema).toContain('Article');
  });

  it('builds the final research sheet and a valid .xlsx file', () => {
    const sheets = keywordResearchSheets(kws, mapping);
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Topics', 'Keywords', 'Page plan', 'Blog ideas', 'Competing pages', 'Removed keywords']);
    const keywords = sheets.find((s) => s.name === 'Keywords')!;
    expect(keywords.rows[0]).toEqual(expect.arrayContaining(['ac repair', 'Ac repair', 'Primary', 'https://myhvac.com/services/ac-repair/', 900, 250, 20]));
    expect(sheets.find((s) => s.name === 'Removed keywords')!.rows).toEqual([['ac repair jobs', 'Job searches', 100, 20]]);

    const file = toXlsx(sheets);
    const text = new TextDecoder().decode(file);
    // A zip (PK), with the workbook, every sheet and the end-of-directory record listing 5 + 7 files.
    expect([file[0], file[1]]).toEqual([0x50, 0x4b]);
    expect(text).toContain('xl/workbook.xml');
    expect(text).toContain('<sheet name="Blog ideas"');
    expect(text).toContain('Why Is My AC Blowing Warm Air?');
    const end = new DataView(file.buffer, file.byteOffset + file.length - 22);
    expect(end.getUint32(0, true)).toBe(0x06054b50);
    expect(end.getUint16(10, true)).toBe(12);
  });

  it('keeps text that looks like a formula as text', () => {
    const file = toXlsx([{ name: 'T', header: ['a'], rows: [['=HYPERLINK("x")']] }]);
    const text = new TextDecoder().decode(file);
    expect(text).toContain('t="inlineStr"');
    expect(text).toContain('=HYPERLINK(&quot;x&quot;)');
    expect(text).not.toContain('<f>');
  });
});
