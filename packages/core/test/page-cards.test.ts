import { describe, expect, it } from 'vitest';
import { pageCards, sameSearch, type KeywordRecord, type MappingRow, type MappingWorkspace } from '../src';

const row = (id: string, head: string, priority: number, url: string | null, o: Partial<MappingRow> = {}): MappingRow => ({
  clusterId: id, topic: head, intent: 'transactional', priority, volume: 100, url, urlLocked: false, reason: '', match: 'medium',
  suggestedPath: url ? null : `/collections/${head.replace(/ /g, '-')}/`, newPageNote: null, action: url ? 'optimise' : 'create', actionLocked: false, newPageType: null,
  primaryKeyword: head, secondaryKeywords: [], currentPosition: null, targetPosition: 10, conflicts: [], drafts: null, linksToAdd: [], schemaNeeded: [], owner: null, status: 'todo', updatedAt: '',
  ...o,
});
const kw = (term: string, clusterId: string, volume: number, intent: KeywordRecord['intent'] = 'transactional') => ({ term, clusterId, volume, intent, status: 'kept', position: null } as unknown as KeywordRecord);
const U = (p: string) => `https://maxbox.uk${p}`;

// maxbox.uk (pet shop): the plan listed "dog food", "dog food uk" and "buy dog food online" as three pages (report 2026-11-25).
describe('page plan cards: one card per page, the pages every site has first', () => {
  const ws: MappingWorkspace = {
    domain: 'maxbox.uk', builtAt: null, auditId: null, usedSearchConsole: false,
    rows: [
      row('c1', 'dog chews', 20, U('/collections/dog-chews/')),
      row('c2', 'natural dog treats', 18, U('/')),
      row('c3', 'dog food uk', 16, null),
      row('c4', 'dog food', 17, null),
      row('c5', 'buy dog food online', 12, null),
      row('c6', 'healthy dog treats', 11, U('/')),
      row('c7', 'maxbox pet shop', 9, U('/pages/about-us/')),
      row('c8', 'cat litter', 8, null),
    ],
  };
  const keywords = [
    kw('dog chews', 'c1', 900), kw('long lasting dog chews', 'c1', 300), kw('are dog chews safe for puppies', 'c1', 90, 'informational'), kw('cat scratching post', 'c1', 400),
    kw('natural dog treats', 'c2', 700), kw('natural treats for dogs', 'c2', 200), kw('treats dog natural', 'c2', 50),
    kw('dog food', 'c4', 5000), kw('dog food uk', 'c3', 800), kw('how much dog food per day', 'c4', 600, 'informational'),
    kw('healthy dog treats', 'c6', 400), kw('cat litter', 'c8', 1000),
  ];
  const cards = pageCards(ws, keywords, [{ url: U('/'), pageType: 'home' }, { url: U('/pages/about-us/'), pageType: 'about' }, { url: U('/collections/dog-chews/'), pageType: 'category' }]);

  it('never shows one page twice and folds searches that repeat each other into one new page', () => {
    expect(sameSearch('dog food uk', 'dog food')).toBe(true);
    expect(sameSearch('puppy food', 'dog food')).toBe(false);
    expect(cards.map((c) => c.url ?? c.primary.term)).toEqual([U('/'), U('/pages/about-us/'), U('/collections/dog-chews/'), 'dog food', 'cat litter']);
    const food = cards.find((c) => c.primary.term === 'dog food')!;
    expect(food.rows.map((r) => r.clusterId)).toEqual(['c4', 'c3', 'c5']);
  });

  it('one primary keyword, then secondary and informational keywords about the page only', () => {
    const home = cards[0]!;
    expect(home.primary.term).toBe('natural dog treats');
    // "natural treats for dogs" and "treats dog natural" repeat the primary in another order: kept once.
    expect(home.secondary.map((k) => k.term)).toEqual(['healthy dog treats']);
    const chews = cards.find((c) => c.primary.term === 'dog chews')!;
    expect(chews.secondary.map((k) => k.term)).toEqual(['long lasting dog chews']);
    expect(chews.informational.map((k) => k.term)).toEqual(['are dog chews safe for puppies']);
    // Off-topic keywords that ended up in the topic are left off the card.
    expect(JSON.stringify(chews)).not.toContain('cat scratching post');
    const food = cards.find((c) => c.primary.term === 'dog food')!;
    expect(food.secondary.map((k) => k.term)).toEqual(['dog food uk', 'buy dog food online']);
    expect(food.informational.map((k) => k.term)).toEqual(['how much dog food per day']);
  });
});

describe('places served never make a keyword relevant on their own', () => {
  it('keeps "hvac near me" and "furnace not turning on", drops other services in the same city', () => {
    const ws: MappingWorkspace = { domain: 'x.com', builtAt: null, auditId: null, usedSearchConsole: false, rows: [row('a', 'furnace repair dallas', 10, 'https://x.com/furnace-repair/')] };
    const keywords = [kw('furnace repair dallas', 'a', 700), kw('furnace not turning on', 'a', 90, 'informational'), kw('furnace repair near me', 'a', 300), kw('plumber dallas', 'a', 900)];
    const [card] = pageCards(ws, keywords, [], ['Dallas']);
    expect(card!.secondary.map((k) => k.term)).toEqual(['furnace repair near me']);
    expect(card!.informational.map((k) => k.term)).toEqual(['furnace not turning on']);
  });
});
