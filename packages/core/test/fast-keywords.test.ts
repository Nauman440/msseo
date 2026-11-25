import { describe, expect, it } from 'vitest';
import {
  applyFastResult, emptyKeywordWorkspace, fastPrompt, fastSeeds, prefilter, runFastKeywords,
  type FastAnswer, type FastProfile, type KeywordMetrics, type OpenAiClient,
} from '../src';
import type { RankedKeyword } from '../src/providers/dataforseo-keywords';

/** maxbox.uk (UK pet treats and food shop), the case in the user's acceptance tests (2026-11-25). */
const U = (p: string) => `https://maxbox.uk${p}`;
const profile = (o: Partial<FastProfile> = {}): FastProfile => ({
  domain: 'maxbox.uk', name: 'Maxbox', businessType: 'ecommerce',
  categories: ['dry dog food', 'dry cat food', 'dog training treats', 'calming dog treats', 'hip and joint dog treats', 'itch and immunity dog treats', 'freeze dried dog treats', 'dog treat subscription box', 'prebiotic dog treats'],
  brandsStocked: [], ownBrands: ['maxbox'], country: 'United Kingdom', cities: [], language: 'en',
  notOffered: ['jar', 'tin', 'camera', 'bakery', '10kg'], bannedClaims: ['pills', 'anxiety', 'cure'], industries: [],
  livePages: [
    { url: U('/'), status: 200, name: 'Maxbox Natural Pet Treats' },
    { url: U('/collections/dry-dog-food'), status: 200, name: 'Dry Dog Food' },
    { url: U('/collections/dry-cat-food'), status: 200, name: 'Dry Cat Food' },
    { url: U('/collections/training-treats'), status: 200, name: 'Dog Training Treats' },
    { url: U('/collections/calming-treats'), status: 200, name: 'Calming Treats' },
    { url: U('/collections/hip-joint'), status: 200, name: 'Hip & Joint Treats' },
    { url: U('/collections/itch-immunity'), status: 200, name: 'Itch & Immunity Treats' },
    { url: U('/collections/freeze-dried-treats'), status: 200, name: 'Freeze Dried Treats' },
    { url: U('/pages/subscription'), status: 200, name: 'Treat Subscription Box' },
    { url: U('/collections/digestive-treats'), status: 200, name: 'Prebiotic & Digestive Treats' },
    { url: U('/product-page/calming-chews'), status: 404, name: '' },
    { url: U('/product-page/itchy-skin-bites'), status: 404, name: '' },
  ],
  competitors: ['scrumbles.co.uk', 'petsathome.com', 'maxbox.uk'], ...o,
});
const m = (term: string, volume: number, cpc = 0.8, difficulty = 20): KeywordMetrics => ({ term, volume, cpc, difficulty, trend: null, trendFrom: null, intent: 'transactional' });
const r = (term: string, volume: number, position: number, url: string): RankedKeyword => ({ ...m(term, volume), position, url });

const IDEAS: KeywordMetrics[] = [
  m('dry dog food', 22000, 1.2), m('dry dog foods', 900), m('dry cat food', 14000, 1.1), m('dog training treats', 3600), m('calming dog treats', 2900, 1.5), m('calm dog treats', 480),
  m('calming treats for dogs', 1300), m('hip and joint dog treats', 1000), m('itchy dog treats', 590), m('itch relief treats for dogs', 320), m('freeze dried dog treats', 2400),
  m('dog treat subscription box', 1900), m('dog treat subscription uk', 720), m('monthly dog treat box', 880), m('prebiotic dog treats', 260), m('digestive dog treats', 390),
  m('how to choose dry dog food', 170, 0.3), m('whiskas dry cat food', 5400), m('purina one dry cat food', 3600), m('royal canin dry dog food', 8100), m('iams cat food', 2900),
  m('applaws cat food', 1600), m('go cat food', 1900), m('harringtons dog food', 4400), m('burns dog food', 3600), m('pet munchies treats', 720), m('pawlicious dog treats', 140),
  m('jr pet products treats', 90), m('dog treats near me', 1600), m('wholesale dog treats', 590), m('dog treat jar', 1300), m('dog treat tin', 320), m('dog camera treat dispenser', 2400),
  m('dog bakery', 1000), m('dry dog food 10kg', 2900), m('calming pills for dogs', 880), m('dog anxiety treats', 1600), m('dog treats', 40000, 0.9), m('dog jobs london', 300),
  m('free dog food samples', 500), m('homemade dog treats', 2400), m('maxbox treats', 50),
];
const RANKED: RankedKeyword[] = [r('calming chews for dogs', 1000, 12, U('/product-page/calming-chews')), r('itchy skin dog bites', 210, 18, U('/product-page/itchy-skin-bites')), r('dry dog food', 22000, 34, U('/collections/dry-dog-food'))];
const GAP: Record<string, RankedKeyword[]> = {
  'scrumbles.co.uk': [r('scrumbles cat food', 1900, 2, 'https://scrumbles.co.uk/'), r('grain free dry cat food', 1300, 4, 'https://scrumbles.co.uk/cat')],
  'petsathome.com': [r('pets at home dog food', 2400, 1, 'https://petsathome.com/'), r('puppy training treats', 1000, 5, 'https://petsathome.com/x')],
};

function fakeKw() {
  const calls: string[] = [];
  return {
    calls,
    kw: {
      async keywordIdeas(seeds: string[]) {
        calls.push(`ideas:${seeds.length}`);
        return { keywords: IDEAS, cost: 0.08 };
      },
      async rankedKeywords(target: string) {
        calls.push(`ranked:${target}`);
        return { keywords: RANKED, cost: 0.04 };
      },
      async keywordGap(competitor: string) {
        calls.push(`gap:${competitor}`);
        return { keywords: GAP[competitor] ?? [], cost: 0.03 };
      },
    } as never,
  };
}

/** An AI answer that groups well but also slips in brands, junk and an address that is not live: the code must catch them. */
function fakeAi() {
  const sent: string[] = [];
  const t = (topic: string, main: string, page: string, kws: [string, 'main' | 'supporting' | 'question'][], intent: 'buy' | 'learn' = 'buy') => ({
    topic, main_keyword: main, intent, page_url: page, page_name: '', is_new_page: false, keywords: kws.map(([keyword, role]) => ({ keyword, volume: 0, role })),
  });
  const answer: FastAnswer = {
    topics: [
      t('Dry dog food', 'dry dog food', U('/collections/dry-dog-food'), [['dry dog food', 'main'], ['dry dog foods', 'supporting'], ['royal canin dry dog food', 'supporting']]),
      t('Dry cat food', 'dry cat food', U('/collections/dry-cat-food'), [['dry cat food', 'main'], ['grain free dry cat food', 'supporting']]),
      t('Dog training treats', 'dog training treats', U('/collections/training-treats'), [['dog training treats', 'main'], ['puppy training treats', 'supporting']]),
      // Calm/calming variants in one topic; the AI points at the dead /product-page/ address.
      t('Calming dog treats', 'calming dog treats', U('/product-page/calming-chews'), [['calming dog treats', 'main'], ['calm dog treats', 'supporting'], ['calming treats for dogs', 'supporting'], ['calming chews for dogs', 'supporting']]),
      t('Hip and joint treats', 'hip and joint dog treats', U('/collections/hip-joint'), [['hip and joint dog treats', 'main']]),
      t('Itch and immunity treats', 'itchy dog treats', '', [['itchy dog treats', 'main'], ['itch relief treats for dogs', 'supporting'], ['itchy skin dog bites', 'supporting']]),
      t('Freeze dried treats', 'freeze dried dog treats', U('/collections/freeze-dried-treats'), [['freeze dried dog treats', 'main']]),
      t('Treat subscription box', 'dog treat subscription box', U('/pages/subscription'), [['dog treat subscription box', 'main'], ['dog treat subscription uk', 'supporting'], ['monthly dog treat box', 'supporting']]),
      t('Prebiotic and digestive treats', 'digestive dog treats', U('/collections/digestive-treats'), [['digestive dog treats', 'main'], ['prebiotic dog treats', 'supporting']]),
      t('Choosing dry dog food', 'how to choose dry dog food', 'new', [['how to choose dry dog food', 'question']], 'learn'),
      // Slipped through by the "AI": a brand topic, a junk keyword and a made-up address.
      t('Whiskas', 'whiskas dry cat food', 'https://maxbox.uk/whiskas', [['whiskas dry cat food', 'main']]),
      t('Dog treats', 'dog treats', 'https://maxbox.uk/made-up', [['dog treats', 'main'], ['dog treat jar', 'supporting']]),
    ],
    removed: [{ keyword: 'dog treats', reason: 'irrelevant' }],
    ask_client: [{ keyword: 'maxbox treats', question: 'Is "maxbox treats" your own product name?' }],
  };
  const client = {
    async generateJson(req: { user: string }) {
      sent.push(req.user);
      return { data: structuredClone(answer), tokens: 4200, model: 'fake' };
    },
  } as unknown as OpenAiClient;
  return { client, sent };
}
const statuses = async (urls: string[]) => Object.fromEntries(urls.map((u) => [u, u.includes('/product-page/') ? 404 : 200]));

const FORBIDDEN = ['whiskas', 'purina', 'royal canin', 'iams', 'applaws', 'go cat', 'scrumbles', 'harringtons', 'burns', 'pet munchies', 'pawlicious', 'jr pet', 'pets at home', 'wholesale', 'near me', 'jar', 'tin', 'camera', 'bakery', '10kg', 'pills', 'anxiety'];

describe('fast keyword pipeline (maxbox.uk acceptance, offline)', () => {
  it('builds at most 15 seeds from the categories and the country', () => {
    const seeds = fastSeeds(profile());
    expect(seeds.length).toBeLessThanOrEqual(15);
    // Every category first, then with the country; "buy … online" when there is room (smaller catalogues).
    for (const c of profile().categories) expect(seeds).toContain(c);
    expect(seeds).toContain('dry dog food uk');
    expect(fastSeeds(profile({ categories: ['dry dog food', 'dry cat food'] }))).toEqual(['dry dog food', 'dry cat food', 'dry dog food uk', 'dry cat food uk', 'buy dry dog food online', 'buy dry cat food online']);
  });

  it('cold run: one call per source, one AI call, clean topics on live pages, redirects for dead /product-page/ addresses', async () => {
    const k = fakeKw();
    const ai = fakeAi();
    const { result, cache } = await runFastKeywords(profile(), { kw: k.kw, ai: ai.client, checkStatus: statuses });
    // One batched ideas request, the site's rankings, max 3 competitors (never the site itself), no per-keyword calls.
    expect(k.calls).toEqual(['ideas:15', 'ranked:maxbox.uk', 'gap:scrumbles.co.uk', 'gap:petsathome.com']);
    expect(ai.sent).toHaveLength(1);
    expect(ai.sent[0]).toContain('1. KEEP only keywords where the searcher wants to buy, hire, compare options or find this kind of');
    expect(result.totalMs).toBeLessThan(60_000);

    const kept = result.topics.flatMap((t) => t.keywords.map((x) => x.keyword));
    expect(kept.length).toBeLessThanOrEqual(80);
    expect(result.topics.length).toBeLessThanOrEqual(25);
    for (const w of FORBIDDEN) expect(kept.filter((x) => ` ${x} `.includes(` ${w} `)), w).toEqual([]);
    // Every topic on a live page (200) or marked new; never named after a brand.
    const live = new Set(profile().livePages.filter((p) => p.status === 200).map((p) => p.url));
    for (const t of result.topics) {
      expect(t.isNew || live.has(t.pageUrl!), t.topic).toBe(true);
      expect(t.topic.toLowerCase()).not.toContain('whiskas');
    }
    const byTopic = Object.fromEntries(result.topics.map((t) => [t.mainKeyword, t]));
    for (const main of ['dry dog food', 'dry cat food', 'dog training treats', 'calming dog treats', 'hip and joint dog treats', 'itchy dog treats', 'freeze dried dog treats', 'dog treat subscription box', 'digestive dog treats']) {
      expect(byTopic[main], main).toBeDefined();
      expect(byTopic[main]!.isNew).toBe(false);
    }
    // One calming topic (calm + calming + chews), one subscription topic, itch on its live page, prebiotic with digestive.
    expect(result.topics.filter((t) => /calm/.test(t.mainKeyword))).toHaveLength(1);
    expect(byTopic['calming dog treats']!.keywords.map((x) => x.keyword)).toEqual(expect.arrayContaining(['calm dog treats', 'calming chews for dogs']));
    expect(byTopic['calming dog treats']!.pageUrl).toBe(U('/collections/calming-treats'));
    expect(byTopic['itchy dog treats']!.pageUrl).toBe(U('/collections/itch-immunity'));
    expect(result.topics.filter((t) => /subscription|box/.test(t.mainKeyword))).toHaveLength(1);
    expect(byTopic['digestive dog treats']!.keywords.map((x) => x.keyword)).toContain('prebiotic dog treats');
    // The question is an article, not a product page.
    expect(byTopic['how to choose dry dog food']?.opportunity).toBe('article');
    // Old /product-page/ addresses that rank but return 404 are redirected to the live page.
    expect(result.redirects).toEqual(expect.arrayContaining([
      { from: U('/product-page/calming-chews'), to: U('/collections/calming-treats') },
      { from: U('/product-page/itchy-skin-bites'), to: U('/collections/itch-immunity') },
    ]));
    // Left out, with reasons; the client question is kept.
    const reasons = Object.fromEntries(result.removed.map((x) => [x.keyword, x.reason]));
    expect(reasons).toMatchObject({ 'whiskas dry cat food': 'brand', 'dog treats near me': 'location', 'wholesale dog treats': 'wrong_intent', 'dog treat jar': 'not_sold', 'calming pills for dogs': 'claim', 'dog anxiety treats': 'claim', 'scrumbles cat food': 'brand' });
    expect(result.askClient).toEqual([{ keyword: 'maxbox treats', question: 'Is "maxbox treats" your own product name?' }]);
    expect(result.steps.map((s) => s.step)).toEqual(expect.arrayContaining(['seeds', 'ideas', 'ranked', 'collect', 'prefilter', 'ai', 'post-checks']));
    expect(result.costUsd).toBeCloseTo(0.18, 2);
    expect(cache.domain).toBe('maxbox.uk');
    printTables(result);
  });

  it('warm run: nothing is paid for or asked again within 30 days, and it is fast', async () => {
    const first = await runFastKeywords(profile(), { kw: fakeKw().kw, ai: fakeAi().client, checkStatus: statuses });
    const k = fakeKw();
    const ai = fakeAi();
    const t = Date.now();
    const { result } = await runFastKeywords(profile(), { kw: k.kw, ai: ai.client, checkStatus: statuses }, { cache: first.cache });
    expect(Date.now() - t).toBeLessThan(5_000);
    expect(k.calls).toEqual([]);
    expect(ai.sent).toHaveLength(0);
    expect(result.warm).toBe(true);
    expect(result.topics.map((x) => x.mainKeyword)).toEqual(first.result.topics.map((x) => x.mainKeyword));
    // "Check again" with force pays again.
    const k2 = fakeKw();
    await runFastKeywords(profile(), { kw: k2.kw, ai: fakeAi().client }, { cache: first.cache, force: true });
    expect(k2.calls.length).toBe(4);
  });

  it('a source that fails or is slow is skipped; the cost cap stops paid calls', async () => {
    const k = fakeKw();
    (k.kw as { rankedKeywords: unknown }).rankedKeywords = async () => {
      throw new Error('boom');
    };
    const { result } = await runFastKeywords(profile(), { kw: k.kw, ai: null });
    expect(result.notes.join(' ')).toMatch(/ranked did not answer/);
    const capped = await runFastKeywords(profile(), { kw: fakeKw().kw, ai: null }, { costCapUsd: 0.12 });
    expect(capped.result.notes.join(' ')).toMatch(/would pass the \$0\.12 limit/);
    // Without the AI the topics are grouped by category and still only on live pages.
    expect(result.topics.length).toBeGreaterThan(0);
    for (const t of result.topics.flatMap((x) => x.keywords)) for (const w of FORBIDDEN) expect(` ${t.keyword} `.includes(` ${w} `)).toBe(false);
  });

  it('site isolation: another site\'s cache, pages and competitors never get in, and a result is saved only on its own site', async () => {
    const other = await runFastKeywords(profile({ domain: 'agency-site.com', livePages: [{ url: 'https://agency-site.com/', status: 200, name: 'Agency' }], competitors: [] }), { kw: fakeKw().kw, ai: fakeAi().client });
    const k = fakeKw();
    const mixed = profile({ livePages: [...profile().livePages, { url: 'https://agency-site.com/seo', status: 200, name: 'Dry dog food SEO' }] });
    const { result, cache } = await runFastKeywords(mixed, { kw: k.kw, ai: fakeAi().client, checkStatus: statuses }, { cache: other.cache });
    expect(k.calls.length).toBe(4); // the agency's cache was not reused
    expect(result.notes.join(' ')).toMatch(/belongs to another website/);
    expect(result.topics.some((t) => (t.pageUrl ?? '').includes('agency-site.com'))).toBe(false);
    expect(() => applyFastResult(emptyKeywordWorkspace('agency-site.com'), result, cache)).toThrow(/cannot be saved on agency-site\.com/);
    const saved = applyFastResult(emptyKeywordWorkspace('maxbox.uk'), result, cache);
    expect(saved.fast?.domain).toBe('maxbox.uk');
    expect(saved.clusters.length).toBe(result.topics.length);
    expect(saved.keywords.filter((x) => x.status === 'kept').length).toBe(result.topics.reduce((s, t) => s + t.keywords.length, 0));
  });

  it('the prompt is filled from the profile and keeps the rules word for word', () => {
    const { candidates } = prefilter(IDEAS.map((x) => ({ term: x.term, volume: x.volume, difficulty: x.difficulty, cpc: x.cpc, position: null, url: null, gscImpressions: null, sources: ['ideas' as const], variants: [] })), profile());
    const text = fastPrompt(profile(), candidates);
    expect(text).toContain('Business: Maxbox (maxbox.uk) — online shop in United Kingdom');
    expect(text).toContain('Does NOT sell: jar, tin, camera, bakery, 10kg');
    expect(text).toContain('Dry Dog Food | https://maxbox.uk/collections/dry-dog-food');
    expect(text).not.toContain('/product-page/calming-chews |');
    expect(text).toContain('7. Never name a topic after a brand. Never map a topic to a URL not in the live list.');
    // "dry dog foods" folded into "dry dog food" as a variant.
    expect(candidates.find((c) => c.term === 'dry dog food')?.variants).toContain('dry dog foods');
  });
});

function printTables(result: Awaited<ReturnType<typeof runFastKeywords>>['result']) {
  if (!process.env.PRINT_FAST) return;
  console.log('\nTOPICS\n' + result.topics.map((t) => `${t.topic} | ${t.mainKeyword} | ${t.volume} | ${t.position ?? '-'} | ${t.opportunity} | ${t.pageUrl ?? 'NEW'} | ${t.keywords.map((k) => k.keyword).join('; ')}`).join('\n'));
  console.log('\nREMOVED\n' + result.removed.map((x) => `${x.keyword} | ${x.reason}${x.detail ? ` (${x.detail})` : ''} | ${x.by}`).join('\n'));
  console.log('\nREDIRECTS\n' + result.redirects.map((x) => `${x.from} -> ${x.to}`).join('\n'));
  console.log('\nSTEPS\n' + result.steps.map((s) => `${s.step} | ${s.ms} ms | $${s.costUsd} | ${s.note ?? ''}`).join('\n'));
}
