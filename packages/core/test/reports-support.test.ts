import { describe, expect, it } from 'vitest';
import {
  emptyMonitor, matchTopic, monthlyReport, reportWeeks, supportHref, supportReply, topicReply, weeklyReport,
  type MonitorWorkspace, type OpenAiClient, type Snapshot, type SupportContext,
} from '../src';

/** Weekly and combined monthly reports; the customer help assistant. */
const snap = (date: string, extra: Partial<Snapshot> = {}): Snapshot => ({
  date, score: 70, clicks28: 100, impressions28: 2000, position28: 14, sessions28: null, leads28: 5, tracked: 10, top3: 1, top10: 3, aiShare: null, reviews: 20, rating: 4.6, ...extra,
});

function workspace(): MonitorWorkspace {
  const ws = emptyMonitor('myhvac.com', new Date('2026-10-01T00:00:00Z'));
  ws.enabled = true;
  ws.snapshots = [
    snap('2026-10-26T10:00:00.000Z'),
    snap('2026-11-02T10:00:00.000Z', { clicks28: 120 }),
    snap('2026-11-09T10:00:00.000Z', { clicks28: 130, score: 74 }),
    snap('2026-11-16T10:00:00.000Z', { clicks28: 125 }),
  ];
  ws.baseline = ws.snapshots[0]!;
  ws.ranks.history = [
    { date: '2026-11-02T10:00:00.000Z', positions: { 'ac repair': 12, 'furnace repair': 4 } },
    { date: '2026-11-09T10:00:00.000Z', positions: { 'ac repair': 7, 'furnace repair': 6 } },
  ];
  ws.alerts = [
    { id: 'a', kind: 'noindex', severity: 'critical', title: 'Page hidden', detail: '', url: null, at: '2026-11-05T06:15:00.000Z', resolvedAt: null },
    { id: 'b', kind: 'rank', severity: 'medium', title: 'Rank drop', detail: '', url: null, at: '2026-11-12T10:00:00.000Z', resolvedAt: null },
  ];
  return ws;
}
const actions = { done: [{ title: 'Fix the AC repair title', doneAt: '2026-11-07T12:00:00.000Z' }], open: 6 };

describe('weekly and monthly reports', () => {
  it('lists one report per weekly snapshot of the month', () => {
    expect(reportWeeks(workspace(), '2026-11')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });

  it('compares a week with the one before and keeps only that week’s events', () => {
    const r = weeklyReport(workspace(), '2026-11-09', actions);
    expect(r.previousDate).toBe('2026-11-02');
    expect(r.changes.find((c) => c.id === 'clicks28')).toMatchObject({ before: 120, now: 130 });
    expect(r.winners).toEqual([{ keyword: 'ac repair', before: 12, now: 7 }]);
    expect(r.losers).toEqual([{ keyword: 'furnace repair', before: 4, now: 6 }]);
    expect(r.alerts.map((a) => a.id)).toEqual(['a']);
    expect(r.actionsDone).toHaveLength(1);
    expect(r.headline).toBe('A good week: more went up than down.');
  });

  it('says so when a week has no snapshot', () => {
    expect(weeklyReport(workspace(), '2026-11-23', actions)).toMatchObject({ snapshot: null, headline: 'No snapshot was taken this week.' });
  });

  it('gives the combined month its weeks', () => {
    const m = monthlyReport(workspace(), '2026-11', actions);
    expect(m.weeks.map((w) => w.date.slice(0, 10))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(m.changes.find((c) => c.id === 'clicks28')).toMatchObject({ before: 100, now: 125 });
    expect(m.alerts).toHaveLength(2);
  });
});

const ctx: SupportContext = {
  name: 'Sam', plan: 'Autopilot', status: 'trial', trialDaysLeft: 4, current: '/my/connections',
  sites: [{ domain: 'myhvac.com', googleConnected: false, searchConsoleChosen: false, analyticsChosen: false, website: 'not connected', lastAudit: '2026-11-20, score 76', nextStep: 'connect Google' }],
};

describe('help assistant', () => {
  it('finds the right help topic without AI', () => {
    expect(matchTopic('How do I connect Google Search Console?')?.id).toBe('connect-search-console');
    expect(matchTopic('my site is not listed in search console')?.id).toBe('property-missing');
    expect(matchTopic('install the wordpress plugin')?.id).toBe('connect-wordpress');
    const r = topicReply('How do I connect Google Search Console?', 'myhvac.com');
    expect(r.links[0]).toEqual({ label: 'Connections', href: '/my/connections?site=myhvac.com' });
    expect(topicReply('what is the weather', null)).toMatchObject({ escalate: true, links: [] });
  });

  it('builds links for the website being viewed', () => {
    expect(supportHref('research_inputs', 'my site.com')).toBe('/my/keywords?view=inputs&site=my%20site.com');
    expect(supportHref('website_connection', 'a.com')).toBe('/my/connections?site=a.com#website');
    expect(supportHref('approvals', 'a.com')).toBe('/my/approvals');
  });

  it('uses the AI answer, keeps only known pages, and sends no address it was not given', async () => {
    let seen = '';
    const client = {
      model: 'test',
      generateJson: async (req: { user: string; parse: { parse: (x: unknown) => unknown } }) => {
        seen = req.user;
        return { data: req.parse.parse({ answer: '1. Open Connections.\n2. Press "Connect Google".', links: ['connections', 'choose_properties'], suggestions: ['What if my site is missing?'], escalate: false }), model: 'test', tokens: 321 };
      },
    } as unknown as OpenAiClient;
    const r = await supportReply(client, [{ role: 'user', text: 'How do I link search console?' }], ctx, 'myhvac.com');
    expect(r).toMatchObject({ ai: true, tokens: 321, escalate: false, suggestions: ['What if my site is missing?'] });
    expect(r.links.map((l) => l.href)).toEqual(['/my/connections?site=myhvac.com', '/my/connect?site=myhvac.com']);
    expect(seen).toContain('Google connected: no');
    expect(seen).toContain('Next step of the setup: connect Google');
  });

  it('falls back to the help topics when OpenAI fails', async () => {
    const client = { model: 'x', generateJson: async () => { throw new Error('down'); } } as unknown as OpenAiClient;
    const r = await supportReply(client, [{ role: 'user', text: 'How do I connect my Shopify store?' }], ctx, 'myhvac.com');
    expect(r.ai).toBe(false);
    expect(r.answer).toContain('myshopify.com');
  });
});
