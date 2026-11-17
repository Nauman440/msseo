import { describe, expect, it } from 'vitest';
import { buildSeeds, classify, cleanKeywords, clusterKeywords, emptyKeywordWorkspace, type KeywordClient, type KeywordRecord } from '../src';

/** Lessons from the live test on an online bedding shop (foldandfeel.co.uk, 2026-11-17). */
const rec = (term: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 1000, trend: null, trendFrom: null, difficulty: 10, cpc: 1, intent: 'transactional', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['suggestion'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '2026-11-17T00:00:00.000Z', ...extra,
});
const shop = () => emptyKeywordWorkspace('foldandfeel.co.uk', { country: 'United Kingdom', seeds: { services: ['bed linen', 'duvet covers', 'tencel bedding'], extra: ['cooling bedding'] } });

describe('keyword research for an online shop', () => {
  it('builds product seeds without "emergency" or "how much does … cost"', () => {
    const seeds = buildSeeds(shop().seeds);
    expect(seeds).toEqual(expect.arrayContaining(['bed linen', 'best duvet covers']));
    expect(seeds.some((s) => /emergency|how much|near me/.test(s))).toBe(false);
    expect(buildSeeds({ services: ['AC repair'], locations: [], brands: [], extra: [] })).toContain('emergency ac repair');
  });

  it('removes other shops, junk from big competitors, and generated phrases nobody searches', () => {
    const ws = {
      ...shop(),
      keywords: [
        rec('bed linen dunelm'),
        rec('duvet covers at m&s'),
        rec('duvet covers at next'),
        rec('dunelm', { intent: 'navigational' }),
        rec('maths games cool', { sources: ['competitor'] }),
        rec('sofa bed', { sources: ['competitor'] }),
        rec('egyptian cotton duvet cover', { sources: ['competitor'] }),
        rec('best tencel bedding', { volume: 0, sources: ['seed'] }),
        rec('cooling bedding', { volume: 0, sources: ['seed'] }),
        rec('tencel sheets', { sources: ['suggestion'] }),
      ],
    };
    const by = Object.fromEntries(cleanKeywords(ws).keywords.map((k) => [k.term, k.removeReason ?? 'kept']));
    expect(by).toEqual({
      'bed linen dunelm': 'Looking for another shop or site',
      'duvet covers at m&s': 'Looking for another shop or site',
      'duvet covers at next': 'Looking for another shop or site',
      dunelm: 'Looking for another shop or site',
      'maths games cool': 'Not about your services', // "cooling bedding" no longer switches on air conditioning words
      'sofa bed': 'Not about your services', // competitor keywords must contain a whole product
      'egyptian cotton duvet cover': 'kept',
      'best tencel bedding': 'No one searches this',
      'cooling bedding': 'kept', // typed by the user: kept even with no recorded searches
      'tencel sheets': 'kept',
    });
  });

  it('classes marketplaces as listing targets, not competitors', () => {
    expect(classify({ domain: 'amazon.co.uk', sources: ['serp'], seenIn: 3, type: 'search', typeLocked: false })).toBe('directory');
    expect(classify({ domain: 'ebay.co.uk', sources: ['serp'], seenIn: 1, type: 'search', typeLocked: false })).toBe('directory');
  });

  it('spots category pages, lowers the chance when big retailers own page 1, and stops Google checks at the deadline', async () => {
    const big = ['https://www.dunelm.com/category/bedding', 'https://www.johnlewis.com/browse/bedding', 'https://www.amazon.co.uk/s?k=x', 'https://www.next.co.uk/shop/bedding', 'https://www.marksandspencer.com/c/home/bedding', 'https://www.argos.co.uk/browse/home'];
    const ws = { ...shop(), keywords: [rec('duvet covers', { volume: 33000, serpUrls: [...big, 'https://small.co.uk/collections/duvet-covers'] })] };
    const r = await clusterKeywords(null, ws);
    expect(r.workspace.clusters[0]).toMatchObject({ pageType: 'category', businessValue: 5, rankingChance: 3 });

    let started = 0;
    const slow = { serpUrls: async () => { started++; await new Promise((ok) => setTimeout(ok, 30)); return { cost: 0.002, urls: [] }; } } as unknown as KeywordClient;
    const many = { ...shop(), keywords: Array.from({ length: 40 }, (_, i) => rec(`duvet covers ${i}`)) };
    const d = await clusterKeywords(slow, many, { deadlineMs: 40 });
    expect(started).toBeLessThan(40);
    expect(d.workspace.clusters.length).toBeGreaterThan(0);
  });
});

describe('audit checks on an online shop', () => {
  it('reads only visible text for spam (Shopify scripts carry other-language names) and skips tap-to-call', async () => {
    const { parsePageContent } = await import('../src/audit/page-content');
    const { isOnlineShop } = await import('../src/audit/rules-trust');
    const html = `<html lang="en"><body><h1>Bed linen</h1><p>Soft TENCEL bedding.</p>
      <script>window.locales={"ru":"Русский язык","ja":"日本語のページ"}</script>
      <a href="/cart">Basket</a><script src="https://cdn.shopify.com/s/files/theme.js"></script></body></html>`;
    const page = parsePageContent(html, 'https://www.foldandfeel.co.uk/');
    expect(page.fullText).not.toMatch(/Русский|日本語/);
    expect(page.fullText).toContain('Soft TENCEL bedding.');
    expect(isOnlineShop([page])).toBe(true);
    expect(isOnlineShop([parsePageContent('<body><h1>AC repair</h1><a href="tel:123">Call</a></body>', 'https://hvac.example/')])).toBe(false);
  });
});

describe('more shop clean-up', () => {
  it('catches other shops written out and searches for other countries', async () => {
    const { cleanKeywords: clean, emptyKeywordWorkspace: empty } = await import('../src');
    const ws = empty('foldandfeel.co.uk', { country: 'United Kingdom', seeds: { services: ['duvet covers', 'tencel bedding'] } });
    const k = (term: string) => ({ ...rec(term) });
    const out = clean({ ...ws, keywords: ['duvet covers marks and spencers', 'm and s duvet covers', 'duvet covers next', 'next bed linen', 'bed linen habitat', 'tencel bedding australia', 'tencel bedding uk', 'duvet covers for us'].map(k) });
    const by = Object.fromEntries(out.keywords.map((x) => [x.term, x.removeReason ?? 'kept']));
    expect(by['m and s duvet covers']).toBe('Looking for another shop or site');
    expect(by['duvet covers marks and spencers']).toBe('Looking for another shop or site');
    expect(by['duvet covers next']).toBe('Looking for another shop or site');
    expect(by['next bed linen']).toBe('Looking for another shop or site');
    expect(by['bed linen habitat']).toBe('Looking for another shop or site');
    expect(by['tencel bedding australia']).toBe('Another country (australia)');
    expect(by['tencel bedding uk']).toBe('kept');
    expect(by['duvet covers for us']).toBe('kept');
  });
});
