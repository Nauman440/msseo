import { describe, expect, it } from 'vitest';
import { bestService, cleanKeywords, emptyKeywordWorkspace, focusPass, PER_SERVICE, type KeywordRecord } from '../src';

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
    const list = Array.from({ length: PER_SERVICE + 10 }, (_, i) => kw(`ac repair dallas ${i}`, { volume: 100 + i * 10, difficulty: i < 5 ? 90 : 20 }));
    const out = focusPass(list, ws);
    const kept = out.filter((k) => k.status === 'kept');
    expect(kept).toHaveLength(PER_SERVICE);
    // The five very hard ones lose to easier keywords with the same demand.
    expect(kept.some((k) => k.difficulty === 90)).toBe(false);
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
});
