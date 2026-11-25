import { describe, expect, it } from 'vitest';
import { aboutAService, emptyKeywordWorkspace, focusPass, keywordRoles, queryKeywords, type KeywordRecord } from '../src';

const rec = (term: string, extra: Partial<KeywordRecord> = {}): KeywordRecord => ({
  term, volume: 500, trend: null, trendFrom: null, difficulty: 10, cpc: 1, intent: 'transactional', position: null, url: null, gscClicks: null, gscImpressions: null,
  sources: ['suggestion'], status: 'kept', removeReason: null, statusLocked: false, serpUrls: null, clusterId: null, addedAt: '2026-11-25T00:00:00.000Z', ...extra,
});

// maxbox.uk (pet shop): no irrelevant keywords (user request 2026-11-25).
describe('only keywords about the services are kept', () => {
  const services = ['dog food', 'dog treats'];
  it('needs the whole service, or half of it with words the site itself uses', () => {
    expect(aboutAService('dry dog food', services)).toBe(true);
    expect(aboutAService('dog collar', services)).toBe(false);
    expect(aboutAService('cat food', services)).toBe(false);
    expect(aboutAService('buy dog treats online uk', services)).toBe(true);
    // The shop's pages talk about chews: "dog chews" shares "dog" and the rest is the site's own word.
    expect(aboutAService('dog chews', services, ['chew'])).toBe(true);
  });

  it('even searches the site already shows up for must fit (or name the brand); hand-kept ones stay', () => {
    const ws = { ...emptyKeywordWorkspace('maxbox.uk', { businessType: 'shop', seeds: { services } }), siteWords: ['chew'] };
    const out = focusPass([
      rec('dog food'), rec('dog collar', { position: 12 }), rec('thrift books', { gscClicks: 3 }), rec('maxbox discount code', { gscClicks: 5 }),
      rec('dog chews'), rec('cat litter', { sources: ['manual'] }),
    ], ws);
    const by = Object.fromEntries(out.map((k) => [k.term, k.removeReason ?? 'kept']));
    expect(by).toEqual({
      'dog food': 'kept',
      'dog collar': 'Not closely about one of your services',
      'thrift books': 'Not closely about one of your services',
      'maxbox discount code': 'kept',
      'dog chews': 'kept',
      'cat litter': 'kept',
    });
  });
});

describe('every kept keyword is intent, supporting or informational', () => {
  const ws = {
    ...emptyKeywordWorkspace('maxbox.uk', { businessType: 'shop', seeds: { services: ['dog treats'] } }),
    clusters: [{ id: 'c1', name: 'dry dog food', head: 'dry dog food' } as never],
    keywords: [
      rec('dry dog food', { clusterId: 'c1' }), rec('dry dog food uk', { clusterId: 'c1' }), rec('how much dry dog food per day', { clusterId: 'c1' }),
      rec('dog treats'), rec('best dog food for puppies', { intent: 'informational' }), rec('grain free vs normal dog food', { intent: 'commercial' }),
      rec('dog collar', { status: 'removed' }),
    ],
  };
  it('labels the topic head and typed services intent, questions informational, the rest supporting', () => {
    const roles = Object.fromEntries([...keywordRoles(ws)].map(([k, r]) => [k.term, r]));
    expect(roles).toEqual({
      'dry dog food': 'intent', 'dog treats': 'intent', 'dry dog food uk': 'supporting',
      'how much dry dog food per day': 'informational', 'best dog food for puppies': 'informational', 'grain free vs normal dog food': 'informational',
    });
    expect(queryKeywords(ws, { role: 'informational' }).total).toBe(3);
    expect(queryKeywords(ws, { role: 'intent' }).rows.map((r) => r.term).sort()).toEqual(['dog treats', 'dry dog food']);
  });
});
