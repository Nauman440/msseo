import { describe, expect, it } from 'vitest';
import { completePending, completeness, gridPoints, phoneKey, reviewStats, runLocalAudit, type LocalClient, type Profile, type ReportIssue } from '../src';
import { parsePageContent } from '../src/audit/page-content';

/** Module 9 · Local SEO audit. */
const NOW = new Date('2026-11-19T12:00:00Z');
const profile: Profile = {
  title: 'MyHVAC Heating & Air', cid: 'c1', placeId: 'p1', category: 'HVAC contractor', extraCategories: ['Air conditioning contractor'], description: 'Short.', phone: '+1 214-555-0100',
  address: '120 Elm St, Dallas, TX 75201', city: 'Dallas', zip: '75201', website: 'https://myhvac.com/', domain: 'myhvac.com', photos: 6, claimed: true, attributes: 4, hours: true, logo: true,
  lat: 32.78, lng: -96.8, rating: 4.6, reviews: 120,
};

const fake = (opts: { reviewsReadyAfter?: number } = {}) => {
  let reviewChecks = 0;
  const mapsCalls: string[] = [];
  const client = {
    maps: async (keyword: string, _l: unknown, at?: { lat: number; lng: number }) => {
      mapsCalls.push(at ? `grid:${keyword}` : `find:${keyword}`);
      if (!at) return { cost: 0.002, results: [{ title: 'MyHVAC Heating & Air', domain: 'myhvac.com', cid: 'c1', position: 1, rating: 4.6, reviews: 120, category: null, address: null, phone: null, lat: 32.78, lng: -96.8 }] };
      // North points (lat above the centre): the client is #2; south: not shown.
      const mine = at.lat > 32.78 ? [{ title: 'MyHVAC Heating & Air', domain: 'myhvac.com', cid: 'c1', position: 2, rating: 4.6, reviews: 120, category: null, address: null, phone: null, lat: null, lng: null }] : [];
      return { cost: 0.002, results: [{ title: 'Rival Air', domain: 'rival.com', cid: 'r1', position: 1, rating: 4.9, reviews: 400, category: null, address: null, phone: null, lat: null, lng: null }, ...mine] };
    },
    profile: async () => ({ cost: 0.0054, profile }),
    postReviews: async () => ({ id: 'rev-task', cost: 0.004 }),
    getReviews: async () => {
      reviewChecks++;
      if (reviewChecks <= (opts.reviewsReadyAfter ?? 0)) return { ready: false, reviews: [], total: null };
      return { ready: true, total: 120, reviews: [
        { rating: 5, date: '2026-11-10', answered: true },
        { rating: 4, date: '2026-10-01', answered: false },
        { rating: 5, date: '2026-09-01', answered: true },
        { rating: 3, date: '2026-01-01', answered: false },
      ] };
    },
    postUpdates: async () => ({ id: 'upd-task', cost: 0.003 }),
    getUpdates: async () => ({ ready: true, dates: ['2026-11-01', '2026-05-01'] }),
    questions: async () => ({ total: 4, unanswered: 2, latest: '2026-10-01', cost: 0.003 }),
    listings: async () => ({ cost: 0.002, hits: [
      { domain: 'yelp.com', url: 'https://yelp.com/biz/myhvac', title: 'MyHVAC Heating & Air - Dallas', snippet: 'Call (214) 555-0100' },
      { domain: 'bbb.org', url: 'https://bbb.org/x', title: 'MyHVAC', snippet: 'Phone 214-555-0199' },
    ] }),
  } as unknown as LocalClient;
  return { client, mapsCalls, reviewChecks: () => reviewChecks };
};

const home = parsePageContent(
  '<html><head><script type="application/ld+json">{"@type":"HVACBusiness","name":"MyHVAC Heating & Air","telephone":"214.555.0100","address":{"@type":"PostalAddress","streetAddress":"120 Elm Street","postalCode":"75201"}}</script></head><body><p>Call 214.555.0100</p></body></html>',
  'https://myhvac.com/',
);
const issues = [{ ruleId: '2.9.2', status: 'pass', message: { client: 'Location pages are unique', expert: '' } }] as unknown as ReportIssue[];
const input = { domain: 'myhvac.com', businessName: 'MyHVAC Heating & Air', locale: { country: 'United States', language: 'en' }, searches: ['ac repair', 'furnace repair', 'hvac company', 'extra'], places: ['Dallas'], issues, localLinkDomains: ['dallasnews.com'] };

describe('local helpers', () => {
  it('lays out a 5 × 5 grid around the business', () => {
    const p = gridPoints({ lat: 32.78, lng: -96.8 }, 8, 5);
    expect(p).toHaveLength(25);
    expect(p[12]).toEqual({ lat: 32.78, lng: -96.8 });
    expect(p[0]!.lat).toBeCloseTo(32.78 + 8 / 111.32, 5);
    expect(p[4]!.lng).toBeGreaterThan(-96.8);
  });

  it('scores the profile and compares phone numbers', () => {
    const c = completeness(profile, 'myhvac.com');
    expect(c.checks.filter((x) => !x.ok).map((x) => x.id)).toEqual(['description', 'photos']);
    expect(c.score).toBe(80);
    expect(phoneKey('+1 (214) 555-0100')).toBe(phoneKey('214.555.0100'));
    expect(reviewStats([{ rating: 5, date: '2026-11-01', answered: true }, { rating: 4, date: '2026-01-01', answered: false }], 50, 4.5, NOW)).toMatchObject({ last90: 1, replyRate: 50, latest: '2026-11-01', sample: 2 });
  });
});

describe('local audit run', () => {
  it('builds the profile, consistency, listings, reviews, grid and benchmark', async () => {
    const f = fake();
    const a = await runLocalAudit(input, { client: f.client, homepage: async () => home, wait: async () => undefined }, NOW);
    expect(a.profile?.cid).toBe('c1');
    expect(a.completeness?.score).toBe(80);
    expect(a.nap.map((n) => [n.source, n.phoneOk, n.addressOk])).toEqual([['Google Business Profile', true, true], ['Your website', true, true], ['Yelp', true, null], ['BBB', false, null]]);
    expect(a.citations.filter((c) => c.found).map((c) => c.label)).toEqual(['Yelp', 'BBB']);
    expect(a.reviews).toMatchObject({ total: 120, last90: 3, perMonth: 1, replyRate: 50, latest: '2026-11-10' });
    expect(a.activity).toMatchObject({ posts: 2, posts90: 1, photos: 6, questions: 4, unanswered: 2 });
    // 3 searches (the 4th is dropped) × 25 points; the client shows in the 10 northern points at #2.
    expect(f.mapsCalls.filter((c) => c.startsWith('grid:'))).toHaveLength(75);
    expect(a.grid?.searches[0]).toMatchObject({ found: 10, top3: 10, average: 2 });
    expect(a.rivals[0]).toMatchObject({ name: 'Rival Air', top3: 75, points: 75, reviews: 400 });
    expect(a.fromAudit).toEqual([{ ruleId: '2.9.2', label: 'Location pages unique', status: 'pass', message: 'Location pages are unique' }]);
    expect(a.localLinks).toEqual({ count: 1, examples: ['dallasnews.com'] });
    expect(a.pending).toEqual({});
  });

  it('reads slow reviews on the next visit', async () => {
    const f = fake({ reviewsReadyAfter: 99 });
    const a = await runLocalAudit(input, { client: f.client, homepage: async () => home, wait: async () => undefined, taskBudgetMs: 0 }, NOW);
    expect(a.pending).toEqual({ reviews: 'rev-task' });
    expect(a.reviews).toMatchObject({ total: 120, sample: 0 });
    const ready = fake();
    const done = await completePending(a, ready.client, NOW);
    expect(done?.pending).toEqual({});
    expect(done?.reviews).toMatchObject({ last90: 3 });
  });

  it('says so when there is no Business Profile', async () => {
    const f = fake();
    const none = { ...f.client, maps: async () => ({ cost: 0.002, results: [] }) } as unknown as LocalClient;
    const a = await runLocalAudit(input, { client: none, homepage: async () => home, wait: async () => undefined }, NOW);
    expect(a.profile).toBeNull();
    expect(a.grid).toBeNull();
    expect(a.notes.join(' ')).toContain('No Google Business Profile was found');
  });
});
