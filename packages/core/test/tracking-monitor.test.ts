import { describe, expect, it } from 'vitest';
import {
  compareSnapshots, dailyChecks, detectTags, emptyKeywordWorkspace, emptyMonitor, eventChannel, hashText, monthlyReport, nextMeeting, pickTrackedKeywords, runTrackingAudit,
  sourceHygiene, weeklyRun, weeklySummary, type KeywordCluster, type KeywordRecord, type ReportModel,
} from '../src';

/** Modules 11 (tracking and conversions) and 13 (reporting and monitoring). */
const HOME = `<html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234XYZ"></script>
<script src="//cdn.callrail.com/companies/1/abc/12/swap.js"></script>
<script src="https://embed.tawk.to/123/default"></script>
</head><body><h1>Dallas HVAC</h1><a href="tel:+12145550100">Call</a><a href="/contact-us">Contact</a>
<form><input name="name"><input name="phone"><input name="email"><textarea name="msg"></textarea></form></body></html>`;
const CONTACT = `<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-K2X9QZ"></script></head><body>
<form><input name="a"><input name="b"><input name="c"><input name="d"><input name="e"><input name="f"><input name="g"></form>
<a href="https://wa.me/12145550100">WhatsApp</a><a href="mailto:hi@myhvac.com">Email</a></body></html>`;

describe('tracking audit (Module 11)', () => {
  it('reads tags, call tracking, chat and ways to get in touch from the HTML', () => {
    const t = detectTags(HOME, 'https://myhvac.com/');
    expect(t).toMatchObject({ ga4: ['G-ABC1234XYZ'], callTracking: ['CallRail'], chat: ['Tawk.to'], tel: 1, whatsapp: false, metaPixel: false });
    expect(t.forms).toEqual([4]);
    expect(detectTags('<form><input name="q"></form><form><input name="n"><input name="p"></form>', 'https://myhvac.com/').forms).toEqual([2]);
    expect(detectTags(CONTACT, 'https://myhvac.com/contact-us')).toMatchObject({ gtm: ['GTM-K2X9QZ'], whatsapp: true, mailto: 1, forms: [7] });
  });

  it('maps GA4 event names to the way people got in touch', () => {
    expect(['click_to_call', 'phone_click', 'generate_lead', 'form_submit', 'whatsapp_click', 'book_appointment', 'chat_started', 'purchase', 'page_view'].map(eventChannel)).toEqual([
      'call', 'call', 'form', 'form', 'whatsapp', 'booking', 'chat', 'purchase', null,
    ]);
  });

  it('measures source hygiene', () => {
    const h = sourceHygiene(
      [{ dims: ['Organic Search'], mets: [600] }, { dims: ['Unassigned'], mets: [300] }, { dims: ['Direct'], mets: [100] }],
      [{ dims: ['google / organic'], mets: [600] }, { dims: ['myhvac.com / referral'], mets: [40] }, { dims: ['paypal.com / referral'], mets: [12] }, { dims: ['(not set)'], mets: [50] }],
      'myhvac.com',
    );
    expect(h).toMatchObject({ unassigned: 30, notSet: 5 });
    expect(h.selfReferrals.map((s) => s.source)).toEqual(['myhvac.com / referral']);
    expect(h.gateways.map((s) => s.source)).toEqual(['paypal.com / referral']);
  });

  it('runs the whole audit with GA4 and Search Console', async () => {
    const report = { pages: [{ url: 'https://myhvac.com/contact-us', pageType: 'contact' }], speedByTemplate: [{ url: 'https://myhvac.com/contact-us', mobile: 38 }] } as unknown as ReportModel;
    const html: Record<string, string> = { 'https://myhvac.com/': HOME, 'https://myhvac.com/contact-us': CONTACT };
    const a = await runTrackingAudit(
      { domain: 'myhvac.com', report, gsc: { token: 't', property: 'sc-domain:myhvac.com' }, ga4: { token: 't', property: 'properties/1' } },
      {
        fetchHtml: async (u) => (html[u] ? { url: u, status: 200, html: html[u]!, xRobots: null } : null),
        gscClicks: async () => 420,
        ga4: {
          keyEvents: async () => [{ eventName: 'generate_lead', custom: false }, { eventName: 'click_to_call', custom: true }],
          measurementIds: async () => ['G-ABC1234XYZ'],
          report: async (_t, _p, o) => {
            const d = o.dimensions.join(',');
            if (!d) return [{ dims: [], mets: [1000] }];
            if (d === 'eventName') return [{ dims: ['generate_lead'], mets: [30, 30] }, { dims: ['click_to_call'], mets: [0, 0] }];
            if (d === 'sessionDefaultChannelGroup') return [{ dims: ['Organic Search'], mets: [900] }, { dims: ['Unassigned'], mets: [100] }];
            if (d === 'sessionSourceMedium') return [{ dims: ['google / organic'], mets: [900] }];
            if (d === 'landingPage') return [{ dims: ['/'], mets: [600, 20] }, { dims: ['/blog/tips'], mets: [120, 0] }];
            return [];
          },
        },
      },
    );
    expect(a.pages.map((p) => p.url)).toEqual(['https://myhvac.com/', 'https://myhvac.com/contact-us']);
    const by = Object.fromEntries(a.checks.map((c) => [c.id, c]));
    expect(by.gsc!.status).toBe('pass');
    expect(by.ga4!.detail).toContain('1,000 visits');
    expect(by.tag!.status).toBe('pass');
    expect(by.events).toMatchObject({ status: 'warn' });
    expect(by.events!.detail).toContain('chat, whatsapp');
    expect(by['events-zero']!.detail).toContain('click_to_call');
    expect(by.calltracking!.status).toBe('pass');
    expect(by.sources!.status).toBe('pass');
    expect(by.leadpages!.detail).toContain('/blog/tips');
    expect(a.friction.find((f) => f.url.endsWith('/contact-us'))!.issues.join(' ')).toMatch(/7 fields.*Slow on mobile \(38\/100\)/);
  });

  it('does not fail the tag check when another tag manager (Adobe Launch) loads the tags', async () => {
    const adobe = '<html><head><script async src="//assets.adobedtm.com/33a/60a/launch-311.min.js"></script></head><body><a href="tel:1">Call</a></body></html>';
    expect(detectTags(adobe, 'https://big.com/').tagManagers).toEqual(['Adobe Launch']);
    const off = await runTrackingAudit({ domain: 'big.com', report: null, gsc: null, ga4: null }, { fetchHtml: async (u) => (u === 'https://big.com/' ? { url: u, status: 200, html: adobe, xRobots: null } : null) });
    expect(off.checks.find((c) => c.id === 'tag')).toMatchObject({ status: 'warn', detail: expect.stringContaining('Adobe Launch') });
    const on = await runTrackingAudit(
      { domain: 'big.com', report: null, gsc: null, ga4: { token: 't', property: 'properties/2' } },
      {
        fetchHtml: async (u) => (u === 'https://big.com/' ? { url: u, status: 200, html: adobe, xRobots: null } : null),
        ga4: { keyEvents: async () => [], measurementIds: async () => ['G-ZZZ9999999'], report: async (_t, _p, o) => (o.dimensions.length ? [] : [{ dims: [], mets: [500] }]) },
      },
    );
    expect(on.checks.find((c) => c.id === 'tag')).toMatchObject({ status: 'pass', detail: 'GA4 receives visits; the tag loads through Adobe Launch.' });
  });

  it('without Google, says what to connect', async () => {
    const a = await runTrackingAudit({ domain: 'myhvac.com', report: null, gsc: null, ga4: null }, { fetchHtml: async () => null });
    expect(a.checks.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['gsc', 'ga4']);
    expect(a.notes[0]).toContain('homepage could not be loaded');
  });
});

describe('monitoring (Module 13)', () => {
  const NOW = new Date('2026-11-19T06:00:00Z');
  const page = (html: string, status = 200) => ({ url: 'x', status, html, xRobots: null });

  it('raises and resolves daily alerts: down, robots.txt, noindex, traffic', async () => {
    const ws = emptyMonitor('myhvac.com');
    ws.state.robotsHash = hashText('User-agent: *\nDisallow: /wp-admin/');
    ws.state.robotsBody = 'User-agent: *\nDisallow: /wp-admin/';
    const clicks = [...Array(7).fill(10), ...Array(7).fill(3)].map((c, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, clicks: c }));
    const r1 = await dailyChecks(ws, { fetchPage: async () => null, fetchRobots: async () => 'User-agent: *\nDisallow: /', dailyClicks: async () => clicks, keyPages: [] }, NOW);
    expect(r1.raised.map((a) => [a.kind, a.severity])).toEqual([['down', 'critical'], ['robots', 'critical'], ['traffic', 'high']]);
    expect(r1.raised[1]!.detail).toContain('Added: Disallow: /');
    const later = new Date('2026-11-20T06:00:00Z');
    const r2 = await dailyChecks(ws, {
      fetchPage: async (u) => page(u.endsWith('/services/ac/') ? '<meta name="robots" content="noindex,follow">' : '<h1>ok</h1>'),
      fetchRobots: async () => 'User-agent: *\nDisallow: /',
      keyPages: ['https://myhvac.com/services/ac/'],
    }, later);
    expect(r2.raised.map((a) => a.kind)).toEqual(['up', 'noindex']);
    expect(ws.alerts.find((a) => a.kind === 'down')!.resolvedAt).toBe(later.toISOString());
    const r3 = await dailyChecks(ws, { fetchPage: async () => page('<h1>ok</h1>'), fetchRobots: async () => 'User-agent: *\nDisallow: /', keyPages: ['https://myhvac.com/services/ac/'] }, later);
    expect(r3.raised).toEqual([]);
    expect(ws.alerts.find((a) => a.kind === 'noindex')!.resolvedAt).not.toBeNull();
  });

  it('tracks rankings weekly, keeps a baseline, compares and builds the month', async () => {
    const kw = emptyKeywordWorkspace('myhvac.com');
    kw.clusters = [{ id: 'a', head: 'ac repair dallas', priority: 20 } as KeywordCluster, { id: 'b', head: 'furnace repair', priority: 10 } as KeywordCluster];
    kw.keywords = [{ term: 'heat pump dallas', status: 'kept', position: 8, volume: 300 } as KeywordRecord, { term: 'free ac', status: 'removed', position: 5, volume: 900 } as KeywordRecord];
    const ws = emptyMonitor('myhvac.com');
    ws.ranks.keywords = pickTrackedKeywords(kw);
    expect(ws.ranks.keywords).toEqual(['ac repair dallas', 'furnace repair', 'heat pump dallas']);
    const week1: Record<string, number | null> = { 'ac repair dallas': 4, 'furnace repair': 9, 'heat pump dallas': null };
    const r1 = await weeklyRun(ws, { rank: async (k) => ({ position: week1[k] ?? null, cost: 0.002 }), searchConsole: async () => ({ clicks: 100, impressions: 4000, position: 12.3 }), reviews: async () => ({ reviews: 40, rating: 4.8, cost: 0.004 }), score: 70, aiShare: 10 }, new Date('2026-10-26T09:00:00Z'));
    expect(r1.cost).toBe(0.01);
    expect(ws.baseline).toMatchObject({ top10: 2, top3: 0, clicks28: 100, reviews: 40 });
    const week2: Record<string, number | null> = { 'ac repair dallas': 2, 'furnace repair': null, 'heat pump dallas': 7 };
    const r2 = await weeklyRun(ws, { rank: async (k) => ({ position: week2[k] ?? null, cost: 0.002 }), searchConsole: async () => ({ clicks: 130, impressions: 5000, position: 10 }), reviews: async () => ({ reviews: 43, rating: 4.5, cost: 0.004 }), score: 78, aiShare: 20 }, new Date('2026-11-16T09:00:00Z'));
    expect(r2.raised.map((a) => a.title)).toEqual(['1 tracked search dropped', '3 new Google reviews', 'Google rating went down']);
    expect(compareSnapshots(ws.snapshots[1], ws.snapshots[0]).find((c) => c.id === 'position28')).toMatchObject({ now: 10, before: 12.3, better: 'down' });
    expect(weeklySummary(ws).lines[0]).toBe('SEO health score: 70 → 78 ✓');
    const m = monthlyReport(ws, '2026-11', { done: [{ title: 'Fix titles', doneAt: '2026-11-10T00:00:00Z' }, { title: 'Old', doneAt: '2026-10-01T00:00:00Z' }], open: 4 });
    expect(m.from!.date).toBe('2026-10-26');
    expect(m.winners.map((w) => w.keyword)).toEqual(['heat pump dallas', 'ac repair dallas']);
    expect(m.losers.map((w) => w.keyword)).toEqual(['furnace repair']);
    expect(m.actionsDone.map((a) => a.title)).toEqual(['Fix titles']);
    expect(m.alerts).toHaveLength(3);
  });

  it('schedules review meetings', () => {
    expect(nextMeeting('fortnightly', new Date('2026-11-19T00:00:00Z'))).toBe('2026-12-03');
    expect(nextMeeting('monthly', new Date('2026-11-19T00:00:00Z'))).toBe('2026-12-19');
    expect(nextMeeting('none', new Date())).toBeNull();
  });
});
