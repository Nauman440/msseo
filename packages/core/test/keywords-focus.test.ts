import { describe, expect, it } from 'vitest';
import { bestService, cleanKeywords, emptyKeywordWorkspace, focusPass, LOCAL_LOW_PER_SERVICE, localLowOk, PER_SERVICE, siteStrength, type KeywordRecord } from '../src';

const kw = (term: string, o: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 200, trend: null, trendFrom: null, difficulty: 20, cpc: 4, intent: 'commercial', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['suggestion'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '', ...o,
});
const ws = emptyKeywordWorkspace('coolco.com', { seeds: { services: ['AC repair', 'furnace installation'], locations: ['Dallas, TX'] } });
const reasons = (list: KeywordRecord[]) => Object.fromEntries(list.map((k) => [k.term, k.status === 'kept' ? 'kept' : k.removeReason]));

describe('keyword focus pass', () => {
  it('needs real demand, a close fit to one service and, for a local business, a place', () => {
    const out = focusPass(
      [
        kw('ac repair dallas'),
        kw('ac repair dallas tx cheap', { volume: 0 }),
        kw('furnace dallas'), // half of "furnace installation"
        kw('installation dallas'), // only a generic word
        kw('ac repair service', { volume: 368000 }), // national
        kw('ac repair near me', { volume: 90000 }),
        kw('ac repair', { volume: 368000, position: 14 }), // already on page 2: kept
        kw('my phrase', { sources: ['manual'], volume: 0 }),
      ].map((k, i) => (i === 6 ? { ...k, term: 'air conditioner repair' } : k)),
      ws,
    );
    expect(reasons(out)).toEqual({
      'ac repair dallas': 'kept',
      'ac repair dallas tx cheap': 'Too few searches (under 10 a month)',
      'furnace dallas': 'kept',
      'installation dallas': 'Not closely about one of your services',
      'ac repair service': 'Too broad for a local business (no place in the search)',
      'ac repair near me': 'kept',
      'air conditioner repair': 'kept',
      'my phrase': 'kept',
    });
  });

  it('keeps the best keywords per service, by opportunity', () => {
    const list = Array.from({ length: PER_SERVICE + 10 }, (_, i) => kw(`ac repair dallas ${i}`, { volume: 100 + i * 10, difficulty: i < 5 ? 45 : 20 }));
    const out = focusPass(list, ws);
    const kept = out.filter((k) => k.status === 'kept');
    expect(kept).toHaveLength(PER_SERVICE);
    // The five harder ones lose to easier keywords with about the same demand.
    expect(kept.some((k) => k.difficulty === 45)).toBe(false);
    expect(out.find((k) => k.status === 'removed')!.removeReason).toBe(`Not in the top ${PER_SERVICE} for "AC repair"`);
  });

  it('keeps only a few research questions', () => {
    const list = Array.from({ length: 30 }, (_, i) => kw(`how long does ac repair dallas take ${i}`, { intent: 'informational' }));
    const out = focusPass(list, { ...ws, seeds: { ...ws.seeds, services: ['AC repair'] } });
    const kept = out.filter((k) => k.status === 'kept');
    expect(kept.length).toBeLessThan(10);
    expect(out.filter((k) => k.status === 'removed')[0]!.removeReason).toBe('Research question: only the best few are kept for blog posts');
  });

  it('assigns a keyword to the service it fits best', () => {
    expect(bestService('hvac repair dallas', ['AC repair', 'furnace installation'])).toEqual({ topic: 'AC repair', fit: 1 });
    expect(bestService('new furnace install', ['AC repair', 'furnace installation']).topic).toBe('furnace installation');
  });

  it('runs as the last step of the cleaning', () => {
    // "water" is one of the services' words, so the older rules keep it; one word of three is not enough.
    const three = { ...ws, seeds: { ...ws.seeds, services: ['AC repair', 'tankless water heater'] } };
    const out = cleanKeywords({ ...three, keywords: [kw('ac repair dallas'), kw('water bottle dallas')] });
    expect(reasons(out.keywords)).toEqual({ 'ac repair dallas': 'kept', 'water bottle dallas': 'Not closely about one of your services' });
  });

  it('keeps a sensible list when the research inputs have no services yet', () => {
    const list = Array.from({ length: 100 }, (_, i) => kw(`storage box ${i}`));
    const out = focusPass(list, emptyKeywordWorkspace('maxbox.uk', { businessType: 'shop' }));
    expect(out.filter((k) => k.status === 'kept')).toHaveLength(60);
  });

  it('judges difficulty against what this site can reach', () => {
    const ranked = (n: number, pos: number) => Array.from({ length: n }, (_, i) => kw(`ranked ${pos} ${i}`, { sources: ['ranked'], position: pos, status: 'removed' }));
    expect(siteStrength([]).level).toBe('new');
    expect(siteStrength(ranked(40, 30))).toMatchObject({ level: 'growing', reach: 45 });
    expect(siteStrength(ranked(30, 5))).toMatchObject({ level: 'established', reach: 60 });

    const list = [kw('ac repair dallas hard', { difficulty: 55 }), kw('ac repair dallas easy', { difficulty: 10 })];
    // A new site (reach 30): difficulty 55 is out of reach for now.
    expect(reasons(focusPass(list, ws))).toEqual({ 'ac repair dallas hard': 'Too hard for this site for now (difficulty 55; it can reach about 30)', 'ac repair dallas easy': 'kept' });
    // An established site (reach 60) keeps it.
    expect(focusPass([...list, ...ranked(30, 5)], ws).find((k) => k.term === 'ac repair dallas hard')!.status).toBe('kept');
    // Already on page 1–5 of Google: never removed for difficulty.
    expect(focusPass([kw('ac repair dallas hard', { difficulty: 90, position: 35 })], ws)[0]!.status).toBe('kept');
  });

  it('keeps a few low-volume "service + your place" searches per service', () => {
    expect(localLowOk(kw('ac repair dallas'), ws.seeds)).toBe(true); // exactly service + place
    expect(localLowOk(kw('ac repair dallas tx cheap'), ws.seeds)).toBe(false); // made up, not from Google
    expect(localLowOk(kw('ac repair dallas tx cheap', { sources: ['autocomplete'] }), ws.seeds)).toBe(true);
    const list = Array.from({ length: 8 }, (_, i) => kw(`ac repair dallas ${i}`, { volume: 0, sources: ['autocomplete'] }));
    const out = focusPass(list, ws);
    expect(out.filter((k) => k.status === 'kept')).toHaveLength(LOCAL_LOW_PER_SERVICE);
    expect(out.filter((k) => k.status === 'removed')[0]!.removeReason).toBe('Too few searches (under 10 a month)');
    // Shops have no places: the rule does not apply.
    expect(focusPass(list, { ...ws, businessType: 'shop' }).filter((k) => k.status === 'kept')).toHaveLength(0);
  });
});
