import { describe, expect, it } from 'vitest';
import {
  addManualCompetitor, classify, defaultSearches, hiddenReason, listingKind, discoverCompetitors, emptyWorkspace, normDomain, refreshStrength, removeCompetitor, shortlistStatus, updateCompetitor, isRelevant, repairCompetitors,
  type CompetitorClient, type CompetitorRecord, type CompetitorWorkspace,
} from '../src';

/** Fake DataForSEO: Labs list, one SERP per search, rank overview and history. */
function fake(serps: Record<string, { kind: 'organic' | 'local'; domain: string; title?: string; rating?: number; reviews?: number }[]>, labs = [{ domain: 'carrier.com', intersections: 3500, etv: 330000, keywords: 75000 }]) {
  const calls: string[] = [];
  const client = {
    async competitorsDomain() {
      calls.push('labs');
      return { cost: 0.01, domains: [{ domain: 'myhvac.com', avgPosition: 20, intersections: 7000, etv: 13000, keywords: 7000 }, ...labs.map((l) => ({ ...l, avgPosition: 9 }))] };
    },
    async serp(q: string) {
      calls.push(`serp:${q}`);
      return { cost: 0.002, entries: (serps[q] ?? []).map((e, i) => ({ ...e, title: e.title ?? null, position: i + 1 })) };
    },
    async rankOverview(d: string) {
      calls.push(`rank:${d}`);
      return { cost: 0.012, overview: { etv: 1200, keywords: 300, top3: 20 } };
    },
    async history(d: string) {
      calls.push(`history:${d}`);
      return { cost: 0.1, months: [{ month: '2026-10', etv: 900 }, { month: '2026-11', etv: 1200 }] };
    },
  } as unknown as CompetitorClient;
  return { client, calls };
}

describe('competitor identification', () => {
  it('normalises domains and builds default searches', () => {
    expect(normDomain('https://WWW.Rival-HVAC.com/services?x=1')).toBe('rival-hvac.com');
    expect(defaultSearches(['AC repair', 'Furnace'], ['Dallas', 'Plano'])).toEqual(['ac repair dallas', 'ac repair plano', 'furnace dallas', 'furnace plano']);
    expect(defaultSearches(['AC repair'], [])).toEqual(['ac repair']);
  });

  it('auto-types directories, publishers, local and direct competitors, and keeps a locked type', () => {
    const c = (domain: string, sources: ('labs' | 'serp' | 'local' | 'manual')[], seenIn = 1) => classify({ domain, sources, seenIn, type: 'search', typeLocked: false });
    expect(c('yelp.com', ['serp'], 5)).toBe('directory');
    expect(c('local.yahoo.com', ['serp'])).toBe('directory');
    expect(c('en.wikipedia.org', ['serp'])).toBe('publisher');
    expect(c('estesair.com', ['local'])).toBe('local');
    expect(c('estesair.com', ['local'], 3)).toBe('direct');
    expect(c('estesair.com', ['local', 'serp'])).toBe('direct');
    expect(c('rival.com', ['serp'], 2)).toBe('direct');
    expect(c('carrier.com', ['labs'])).toBe('search');
    expect(classify({ domain: 'yelp.com', sources: ['serp'], seenIn: 3, type: 'direct', typeLocked: true })).toBe('direct');
  });

  it('discovers from Labs and the core searches, excluding the client site and Google', async () => {
    const { client, calls } = fake({
      'ac repair dallas': [{ kind: 'local', domain: 'www.rival.com', title: 'Rival Heating & Air', rating: 4.8, reviews: 212 }, { kind: 'local', domain: 'myhvac.com', title: 'MyHVAC', rating: 4.6, reviews: 38 }, { kind: 'organic', domain: 'rival.com' }, { kind: 'organic', domain: 'www.yelp.com' }, { kind: 'organic', domain: 'google.com' }, { kind: 'organic', domain: 'myhvac.com' }],
      'ac repair plano': [{ kind: 'organic', domain: 'other.com' }, { kind: 'organic', domain: 'rival.com' }],
    });
    const ws = { ...emptyWorkspace('www.myhvac.com'), searches: ['ac repair dallas', 'ac repair plano'] };
    const { workspace, newDomains, cost, errors } = await discoverCompetitors(client, ws);
    expect(errors).toEqual([]);
    expect(newDomains).toEqual([]); // first run: nothing is "new"
    expect(workspace.lastRunAt).not.toBeNull();
    const by = Object.fromEntries(workspace.competitors.map((c) => [c.domain, c]));
    expect(Object.keys(by).sort()).toEqual(['carrier.com', 'other.com', 'rival.com', 'yelp.com']);
    expect(by['rival.com']).toMatchObject({ type: 'direct', name: 'Rival Heating & Air', seenIn: 2, etv: 1200, rating: 4.8, reviews: 212, rejected: false, listing: 'unchecked' });
    // The client's own site: the "You" row (map rating, positions, Labs visits).
    expect(workspace.own).toMatchObject({ seenIn: 1, rating: 4.6, reviews: 38, etv: 1200, keywords: 300 });
    expect(workspace.own?.avgPosition).toBe(4); // map pack #2 and result #6
    expect(by['yelp.com']?.type).toBe('directory');
    expect(by['carrier.com']).toMatchObject({ type: 'search', sharedKeywords: 3500, etv: 330000 });
    expect(by['other.com']?.type).toBe('search'); // seen in one search only
    // Rank overview only for searched domains without Labs metrics, never for directories.
    expect(calls.filter((c) => c.startsWith('rank:')).sort()).toEqual(['rank:myhvac.com', 'rank:other.com', 'rank:rival.com']);
    expect(cost).toBeCloseTo(0.01 + 2 * 0.002 + 3 * 0.012);
  });

  it('keeps hand-made choices and flags domains that are new on a refresh', async () => {
    const first = await discoverCompetitors(fake({ q: [{ kind: 'organic', domain: 'rival.com' }] }).client, { ...emptyWorkspace('myhvac.com'), searches: ['q'] });
    let ws = updateCompetitor(first.workspace, 'rival.com', { shortlist: 'direct', type: 'local', notes: 'Main rival' });
    ws = addManualCompetitor(ws, { domain: 'https://friend-of-owner.com', name: 'Owner’s pick' });
    const second = await discoverCompetitors(fake({ q: [{ kind: 'organic', domain: 'rival.com' }, { kind: 'organic', domain: 'newcomer.com' }] }).client, ws);
    const by = Object.fromEntries(second.workspace.competitors.map((c) => [c.domain, c]));
    expect(by['rival.com']).toMatchObject({ shortlist: 'direct', type: 'local', typeLocked: true, notes: 'Main rival', isNew: false });
    expect(by['friend-of-owner.com']).toMatchObject({ sources: ['manual'], name: 'Owner’s pick' });
    expect(by['newcomer.com']?.isNew).toBe(true);
    expect(second.newDomains).toEqual(['newcomer.com']);
    expect(second.workspace.competitors[0]?.domain).toBe('rival.com'); // shortlisted first
    expect(removeCompetitor(second.workspace, 'newcomer.com').competitors.some((c) => c.domain === 'newcomer.com')).toBe(false);
  });

  it('refreshes strength for the shortlist only, and reports shortlist health', async () => {
    let ws = addManualCompetitor(addManualCompetitor(emptyWorkspace('myhvac.com'), { domain: 'a.com' }), { domain: 'b.com' });
    ws = updateCompetitor(ws, 'a.com', { shortlist: 'aspirational' });
    const { client, calls } = fake({});
    const r = await refreshStrength(client, ws);
    expect(calls).toEqual(['rank:a.com', 'history:a.com']);
    expect(r.workspace.competitors.find((c) => c.domain === 'a.com')).toMatchObject({ etv: 1200, trend: [{ month: '2026-10', etv: 900 }, { month: '2026-11', etv: 1200 }] });
    expect(shortlistStatus(r.workspace)).toMatchObject({ direct: 0, aspirational: 1 });
    expect(shortlistStatus(r.workspace).warnings).toHaveLength(2);
  });
});

describe('autopilot shortlist', () => {
  it('shortlists the strongest direct rivals and two aspirational sites, never over a person', async () => {
    const { autoShortlist } = await import('../src');
    const rec = (domain: string, type: 'direct' | 'local' | 'search' | 'directory', seenIn: number, etv: number | null) => ({
      domain, name: null, type, typeLocked: false, shortlist: 'none' as const, sources: ['serp' as const], seenIn, avgPosition: null, sharedKeywords: null,
      etv, keywords: null, trend: null, notes: null, isNew: false, firstSeenAt: '', refreshedAt: null,
    });
    const ws = {
      ...emptyWorkspace('myhvac.com'),
      competitors: [
        rec('a.com', 'direct', 5, 900), rec('b.com', 'local', 4, 100), rec('c.com', 'direct', 3, 50), rec('d.com', 'direct', 2, 10), rec('e.com', 'direct', 2, 5), rec('f.com', 'direct', 1, 1),
        rec('big.com', 'search', 0, 50_000), rec('bigger.com', 'search', 0, 90_000), rec('giant.com', 'search', 0, 9_000_000), rec('yelp.com', 'directory', 9, null),
      ],
    };
    const out = autoShortlist(ws);
    const by = Object.fromEntries(out.competitors.map((c) => [c.domain, c.shortlist]));
    expect(Object.keys(by).filter((d) => by[d] === 'direct')).toEqual(['a.com', 'b.com', 'c.com', 'd.com', 'e.com']);
    expect(Object.keys(by).filter((d) => by[d] === 'aspirational')).toEqual(['big.com', 'bigger.com']);
    expect(by['giant.com']).toBe('none'); // over a million visits a month: not a realistic rival
    expect(by['yelp.com']).toBe('none');
    // A shortlist someone made by hand is left alone.
    const manual = updateCompetitor(ws, 'f.com', { shortlist: 'direct' });
    expect(autoShortlist(manual).competitors.filter((c) => c.shortlist !== 'none').map((c) => c.domain)).toEqual(['f.com']);
  });

  it('hides job boards, retailers and information sites, unless someone moved them back', () => {
    expect(hiddenReason({ domain: 'indeed.com', typeLocked: false })).toBe('Job board');
    expect(hiddenReason({ domain: 'homedepot.com', typeLocked: false })).toBe('Retailer');
    expect(hiddenReason({ domain: 'energy.gov', typeLocked: false })).toBe('Information');
    expect(hiddenReason({ domain: 'rival-hvac.com', typeLocked: false })).toBeNull();
    expect(hiddenReason({ domain: 'indeed.com', typeLocked: true })).toBeNull();
    expect(listingKind({ domain: 'yelp.com', type: 'directory' })).toBe('review');
    expect(listingKind({ domain: 'facebook.com', type: 'directory' })).toBe('social');
    expect(listingKind({ domain: 'amazon.co.uk', type: 'directory' })).toBe('marketplace');
    expect(listingKind({ domain: 'angi.com', type: 'directory' })).toBe('directory');
    expect(listingKind({ domain: 'reddit.com', type: 'publisher' })).toBe('publisher');
  });

  it('"Not a competitor" clears the shortlist; picking a shortlist clears it again; listings keep their status', () => {
    let ws = addManualCompetitor(emptyWorkspace('myhvac.com'), { domain: 'rival.com' });
    ws = updateCompetitor(ws, 'rival.com', { shortlist: 'direct' });
    ws = updateCompetitor(ws, 'rival.com', { rejected: true });
    expect(ws.competitors[0]).toMatchObject({ shortlist: 'none', rejected: true });
    ws = updateCompetitor(ws, 'rival.com', { shortlist: 'aspirational' });
    expect(ws.competitors[0]).toMatchObject({ shortlist: 'aspirational', rejected: false });
    ws = updateCompetitor(ws, 'rival.com', { listing: 'listed' });
    expect(ws.competitors[0]?.listing).toBe('listed');
  });
});

describe('relevance of competitors from the competitor database', () => {
  const rec = (domain: string, o: Partial<CompetitorRecord> = {}): CompetitorRecord => ({
    domain, name: null, type: 'search', typeLocked: false, shortlist: 'none', sources: ['labs'], seenIn: 0, avgPosition: 20, sharedKeywords: 2,
    etv: 500_000, keywords: 90_000, trend: null, notes: null, isNew: false, firstSeenAt: '', refreshedAt: null, ...o,
  });

  it('a new site’s few shared keywords do not make a software site or a bookshop a competitor', () => {
    const own = { seenIn: 0, avgPosition: null, rating: null, reviews: null, etv: 0, keywords: 4 };
    expect(isRelevant(rec('sourceforge.net'), own)).toBe(false);
    expect(isRelevant(rec('petshop-rival.com', { sources: ['serp'], seenIn: 1 }), own)).toBe(true);
    // An established site: sharing a real slice of its searches counts.
    const big = { ...own, keywords: 400 };
    expect(isRelevant(rec('rival.com', { sharedKeywords: 60 }), big)).toBe(true);
    expect(isRelevant(rec('random.com', { sharedKeywords: 12 }), big)).toBe(false);
  });

  it('repair takes autopilot’s unrelated picks off the list, keeps a person’s, and refills from relevant sites', () => {
    const ws: CompetitorWorkspace = {
      ...emptyWorkspace('maxbox.uk'),
      own: { seenIn: 0, avgPosition: null, rating: null, reviews: null, etv: 0, keywords: 3 },
      competitors: [
        rec('allamericanpettreat.com', { type: 'direct', sources: ['serp', 'local'], seenIn: 1, shortlist: 'direct', etv: null }),
        rec('sourceforge.net', { shortlist: 'aspirational', etv: 893_593 }),
        rec('thriftbooks.com', { shortlist: 'aspirational', etv: 481_453 }),
        rec('bigpetstore.com', { sources: ['serp'], seenIn: 1, etv: 40_000 }),
        rec('chewy-like.com', { sources: ['labs'], shortlist: 'aspirational', shortlistBy: 'person', etv: 200_000 }),
      ],
    };
    const { workspace, changed } = repairCompetitors(ws);
    expect(changed).toBe(true);
    const by = Object.fromEntries(workspace.competitors.map((c) => [c.domain, c.shortlist]));
    expect(by['sourceforge.net']).toBeUndefined();
    expect(by['thriftbooks.com']).toBeUndefined();
    expect(by['chewy-like.com']).toBe('aspirational'); // a person picked it: never touched
    expect(by['allamericanpettreat.com']).toBe('direct');
    // A person has a pick, so empty slots are not refilled.
    expect(by['bigpetstore.com']).toBe('none');

    const auto = repairCompetitors({ ...ws, competitors: ws.competitors.filter((c) => c.domain !== 'chewy-like.com') }).workspace;
    expect(auto.competitors.find((c) => c.domain === 'bigpetstore.com')).toMatchObject({ shortlist: 'aspirational', shortlistBy: 'auto' });
    expect(repairCompetitors(auto).changed).toBe(false);
  });
});
