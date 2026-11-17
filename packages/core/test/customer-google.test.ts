import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_GOOGLE_SCOPES, ga4Summary, ga4WebStreamHosts, gscAuthUrl, listGa4Properties, matchGa4Properties, searchesFrom, weeklyPlan, type GscRow, type ReportModel } from '../src';

/** Customers connect their own Google (Search Console + Analytics 4). Sample responses only, no live calls. */
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('customer Google connection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for Search Console and Analytics, both read-only', () => {
    const url = new URL(gscAuthUrl({ clientId: 'id', clientSecret: 's', redirectUri: 'https://msseo.tech/api/gsc/callback' }, 'st', CUSTOMER_GOOGLE_SCOPES));
    expect(url.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });

  it('lists GA4 properties across pages, skipping roll-ups', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('pageToken=p2')
        ? json({ accountSummaries: [{ account: 'accounts/2', displayName: 'Other', propertySummaries: [{ property: 'properties/9', displayName: 'Blog', propertyType: 'PROPERTY_TYPE_ORDINARY' }] }] })
        : json({
            accountSummaries: [{ account: 'accounts/1', displayName: 'Summit Air', propertySummaries: [{ property: 'properties/5', displayName: 'summitairhvac.com - GA4', propertyType: 'PROPERTY_TYPE_ORDINARY' }, { property: 'properties/6', displayName: 'Roll-up', propertyType: 'PROPERTY_TYPE_ROLLUP' }] }],
            nextPageToken: 'p2',
          }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const props = await listGa4Properties('tok');
    expect(props).toEqual([
      { account: 'accounts/1', accountName: 'Summit Air', property: 'properties/5', name: 'summitairhvac.com - GA4' },
      { account: 'accounts/2', accountName: 'Other', property: 'properties/9', name: 'Blog' },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('analyticsadmin.googleapis.com/v1beta/accountSummaries');
  });

  it('reads web stream hosts and puts the matching property first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ dataStreams: [{ type: 'WEB_DATA_STREAM', webStreamData: { defaultUri: 'https://www.summitairhvac.com' } }, { type: 'IOS_APP_DATA_STREAM' }] })));
    expect(await ga4WebStreamHosts('tok', 'properties/5')).toEqual(['summitairhvac.com']);
    const ranked = matchGa4Properties(
      [
        { account: 'a/1', accountName: 'A', property: 'properties/1', name: 'Old site', hosts: ['other.com'] },
        { account: 'a/1', accountName: 'A', property: 'properties/5', name: 'Main', hosts: ['summitairhvac.com'] },
      ],
      'summitairhvac.com',
    );
    expect(ranked.map((p) => [p.property, p.matches])).toEqual([['properties/5', true], ['properties/1', false]]);
  });

  it('reads sessions and key events for the last 28 days', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }] });
      return json({ rows: [{ metricValues: [{ value: '1534' }, { value: '23' }] }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await ga4Summary('tok', 'properties/5')).toEqual({ sessions: 1534, keyEvents: 23, days: 28 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://analyticsdata.googleapis.com/v1beta/properties/5:runReport');
  });
});

describe("this week's plan", () => {
  const row = (query: string, page: string, position: number, impressions: number, clicks = 1): GscRow => ({ keys: [query, page], position, impressions, clicks, ctr: 0 });

  it('merges pages per search with impression-weighted position', () => {
    const s = searchesFrom([row('ac repair dallas', 'https://x.com/a', 6, 100), row('ac repair dallas', 'https://x.com/b', 12, 300)]);
    expect(s).toEqual([{ query: 'ac repair dallas', impressions: 400, clicks: 2, page: 'https://x.com/b', position: 10.5 }]);
  });

  it('picks the five searches nearest page 1 (positions 4–20) and actions from the audit', () => {
    const report = {
      issues: [
        { ruleId: '2.1.3', urls: ['https://x.com/services/ac-repair/'] },
        { ruleId: '2.8.1', urls: ['https://x.com/services/ac-repair/'] },
        { ruleId: '2.6.3', urls: ['https://x.com/heat-pumps/'] },
      ],
    } as unknown as ReportModel;
    const rows = [
      row('top already', 'https://x.com/', 2, 900),
      row('ac repair [city]', 'https://x.com/services/ac-repair/', 6, 400),
      row('heat pump installation', 'https://x.com/heat-pumps/', 8, 300),
      row('furnace installation', 'https://x.com/furnace/', 11, 250),
      row('hvac maintenance plan', 'https://x.com/maintenance/', 14, 200),
      row('24 hour ac repair', 'https://x.com/', 19, 150),
      row('far away', 'https://x.com/z/', 35, 5000),
      row('too rare', 'https://x.com/y/', 5, 3),
      row('sixth one', 'https://x.com/s/', 20, 120),
    ];
    const plan = weeklyPlan(rows, report);
    expect(plan.map((p) => [p.query, Math.round(p.position), p.actions])).toEqual([
      ['ac repair [city]', 6, ['Title', 'Answer']],
      ['heat pump installation', 8, ['Links']],
      ['furnace installation', 11, ['Section']], // no finding, page 2: grow the content
      ['hvac maintenance plan', 14, ['Section']],
      ['24 hour ac repair', 19, ['Section']],
    ]);
  });
});
