import { describe, expect, it } from 'vitest';
import {
  applyHoldList, applyOrder, visibleIn, dailyAverage, DEFAULT_AUTOPILOT_SETTINGS, dueCheckpoint, generateWorkItems, judgeResult, llmsText, localParts, onHoldList, plannedEmails,
  runDue, sitemapUrl, timezoneFor, todaysShare, workingDaysLeft, type InventoryItem, type RunSummary, type SiteInventory, type WorkItem, type WpStatus,
} from '../src';

const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: o.id ?? `ms-${Math.random().toString(36).slice(2, 10)}`, accountId: 'a', domain: 'shop.test', actionId: 'x', taskId: null, type: 'meta_title', target: { post_id: 1 }, url: 'https://shop.test/a/',
  label: 'Title tag · A', before: null, newValue: 'T', status: 'draft', reason: null, priority: 30, month: 1, week: 1, dependsOn: [], createdAt: '', scheduledFor: null, appliedAt: null, verifiedAt: null, attempts: 0, ...o,
});

describe('working-day schedule', () => {
  const s = { ...DEFAULT_AUTOPILOT_SETTINGS, enabled: true, timezone: 'Europe/London', runHour: 9 };
  it('runs Monday to Friday from the run hour, once a day, in the site time zone', () => {
    // Wed 26 Nov 2026 09:30 London = 09:30 UTC.
    expect(localParts(new Date('2026-11-26T09:30:00Z'), 'Europe/London')).toMatchObject({ date: '2026-11-26', weekday: 4, hour: 9 });
    expect(runDue(s, null, new Date('2026-11-26T09:30:00Z'))).toBe(true);
    expect(runDue(s, '2026-11-26', new Date('2026-11-26T10:30:00Z'))).toBe(false);
    expect(runDue(s, null, new Date('2026-11-26T08:30:00Z'))).toBe(false);
    expect(runDue(s, null, new Date('2026-11-28T10:00:00Z'))).toBe(false); // Saturday
    expect(runDue({ ...s, timezone: 'Asia/Karachi' }, null, new Date('2026-11-26T04:30:00Z'))).toBe(true); // 09:30 in Karachi
    expect(runDue({ ...s, enabled: false }, null, new Date('2026-11-26T09:30:00Z'))).toBe(false);
  });
  it('spreads the month over the working days left', () => {
    const now = new Date('2026-11-26T09:00:00Z');
    const end = new Date('2026-12-10T09:00:00Z');
    expect(workingDaysLeft(now, end, 'Europe/London')).toBe(10);
    expect(todaysShare(60, now, end, 'Europe/London', 30)).toBe(6);
    expect(todaysShare(12, now, end, 'Europe/London', 30)).toBe(5);
    expect(todaysShare(3, now, end, 'Europe/London', 30)).toBe(3);
    expect(todaysShare(900, now, end, 'Europe/London', 30)).toBe(30);
  });
  it('reads a time zone from the country', () => {
    expect(timezoneFor('Pakistan')).toBe('Asia/Karachi');
    expect(timezoneFor('United Arab Emirates')).toBe('Asia/Dubai');
    expect(timezoneFor(null)).toBe('Europe/London');
  });
});

describe('safety hold list', () => {
  it('matches exact pages, folders and wildcards', () => {
    expect(onHoldList('https://www.shop.test/checkout/', ['/checkout/'])).toBe(true);
    expect(onHoldList('https://shop.test/blog/post-1/', ['shop.test/blog'])).toBe(true);
    expect(onHoldList('https://shop.test/blog/post-1/', ['/blog/*'])).toBe(true);
    expect(onHoldList('https://shop.test/about/', ['/blog/*', '/checkout/'])).toBe(false);
  });
  it('turns held drafts into skipped, never sent', () => {
    const items = applyHoldList([wi({ url: 'https://shop.test/checkout/' }), wi({ url: 'https://shop.test/about/' })], ['/checkout/']);
    expect(items.map((i) => i.status)).toEqual(['skipped', 'draft']);
    expect(applyOrder(items)).toHaveLength(1);
  });
  it('in approve mode only approved changes are ready', () => {
    const items = [wi({ id: 'ms-aaaaaaaa' }), wi({ id: 'ms-bbbbbbbb', approvedAt: '2026-11-26T00:00:00Z' })];
    expect(applyOrder(items, true).map((i) => i.id)).toEqual(['ms-bbbbbbbb']);
    expect(applyOrder(items)).toHaveLength(2);
  });
});

describe('results at 7, 14 and 28 days', () => {
  it('knows which checkpoint is due', () => {
    const i = wi({ status: 'verified', appliedAt: '2026-11-01T09:00:00Z' });
    expect(dueCheckpoint(i, new Date('2026-11-05T09:00:00Z'))).toBeNull();
    expect(dueCheckpoint(i, new Date('2026-11-09T09:00:00Z'))).toBe(7);
    expect(dueCheckpoint({ ...i, checks: [{ day: 7 } as never] }, new Date('2026-11-16T09:00:00Z'))).toBe(14);
    expect(dueCheckpoint({ ...i, type: 'redirect_301' }, new Date('2026-11-16T09:00:00Z'))).toBeNull();
  });
  it('calls a change harmful only with a clear drop and enough data', () => {
    const before = dailyAverage([{ clicks: 4, impressions: 100, position: 5 }, { clicks: 6, impressions: 100, position: 7 }], 2);
    expect(before).toEqual({ clicks: 5, impressions: 100, position: 6 });
    expect(judgeResult(before, { clicks: 2, impressions: 80, position: 10 })).toBe('worse');
    expect(judgeResult(before, { clicks: 4.6, impressions: 80, position: 10 })).toBe('same');
    expect(judgeResult(before, { clicks: 6, impressions: 120, position: 4.5 })).toBe('better');
    expect(judgeResult({ clicks: 0, impressions: 1, position: 30 }, { clicks: 0, impressions: 0, position: 50 })).toBe('too_little_data');
  });
});

describe('site files: sitemap, robots.txt, llms.txt', () => {
  const site = 'https://shop.test';
  const home: InventoryItem = { id: 1, url: `${site}/`, type: 'page', name: 'Home', titleTag: null, seoTitle: null, metaDescription: null, canonical: null, noindex: false, nofollow: false, h1s: [], images: [], wordCount: 300, schemaTypes: [], builder: 'gutenberg', isFrontPage: true, modified: null };
  const about: InventoryItem = { ...home, id: 2, url: `${site}/about/`, name: 'About us', isFrontPage: false };
  const inv = (st: Partial<WpStatus>): SiteInventory => ({ accountId: 'a', domain: 'shop.test', platform: 'wordpress', refreshedAt: '', items: [home, about], totals: {}, truncated: false, errors: [], status: { home_url: `${site}/`, seo_plugin: 'none', sitemap: { url: null, by: 'none' }, llms_file: false, ...st } as WpStatus });
  const gen = (st: Partial<WpStatus>, robotsTxt?: string | null) => generateWorkItems({ accountId: 'a', domain: 'shop.test', actions: [], inventory: inv(st), live: [], profile: { name: 'Paws', places: ['Leeds'], brands: [], services: ['dog beds'], bannedWords: [], competitors: [] }, keywords: new Map(), deadUrls: [], robotsTxt, now: new Date('2026-11-26T09:00:00Z') });

  it('creates the sitemap when the site has none, or replaces WordPress’s basic one', async () => {
    const none = (await gen({})).items.find((i) => i.type === 'sitemap')!;
    expect(none).toMatchObject({ status: 'draft', newValue: { enabled: true }, week: 1, label: 'Create the XML sitemap' });
    expect((await gen({ sitemap: { url: `${site}/wp-sitemap.xml`, by: 'wordpress' } })).items.find((i) => i.type === 'sitemap')!.status).toBe('draft');
    expect((await gen({ seo_plugin: 'yoast', sitemap: { url: `${site}/sitemap_index.xml`, by: 'yoast' } })).items.find((i) => i.type === 'sitemap')!.status).toBe('keep');
    expect((await gen({ sitemap: { url: `${site}/sitemap.xml`, by: 'msscore' } })).items.find((i) => i.type === 'sitemap')!.status).toBe('keep');
  });
  it('submits the sitemap Google should read, every month', async () => {
    expect(sitemapUrl(inv({ sitemap: { url: `${site}/wp-sitemap.xml`, by: 'wordpress' } }))).toBe(`${site}/sitemap.xml`);
    expect(sitemapUrl(inv({ seo_plugin: 'yoast', sitemap: { url: `${site}/sitemap_index.xml`, by: 'yoast' } }))).toBe(`${site}/sitemap_index.xml`);
    const submit = (await gen({})).items.find((i) => i.type === 'gsc_sitemap_submit')!;
    expect(submit.newValue).toEqual({ sitemap: `${site}/sitemap.xml`, month: '2026-11' });
  });
  it('adds the sitemap line to robots.txt only when it is missing', async () => {
    expect((await gen({}, 'User-agent: *\nDisallow:')).items.find((i) => i.type === 'robots_txt')?.status).toBe('draft');
    expect((await gen({}, 'User-agent: *\nSitemap: https://shop.test/sitemap.xml')).items.find((i) => i.type === 'robots_txt')).toBeUndefined();
  });
  it('checks the sitemap, robots.txt and llms.txt on the live site', () => {
    expect(visibleIn(wi({ type: 'sitemap', newValue: { enabled: true } }), '<?xml version="1.0"?><sitemapindex>')).toBe(true);
    expect(visibleIn(wi({ type: 'sitemap', newValue: { enabled: true } }), '<html>Not found</html>')).toBe(false);
    expect(visibleIn(wi({ type: 'robots_txt', newValue: { enabled: true } }), 'User-agent: *\nSitemap: https://x/sitemap.xml')).toBe(true);
    expect(visibleIn(wi({ type: 'llms_txt', newValue: { content: '# Paws\n' } }), '# Paws\n> x')).toBe(true);
  });
  it('gives every change a new id after “Start over”', async () => {
    const a = (await gen({})).items.map((i) => i.id);
    const st = { home_url: `${site}/`, seo_plugin: 'none', sitemap: { url: null, by: 'none' }, llms_file: false } as unknown as WpStatus;
    const b = (await generateWorkItems({ accountId: 'a', domain: 'shop.test', actions: [], inventory: { ...inv({}), status: st }, live: [], profile: { name: 'Paws', places: ['Leeds'], brands: [], services: ['dog beds'], bannedWords: [], competitors: [] }, keywords: new Map(), deadUrls: [], idSalt: '1', now: new Date('2026-11-26T09:00:00Z') })).items.map((i) => i.id);
    expect(a).toHaveLength(b.length);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
  it('writes a dated llms.txt, and leaves a site’s own file alone', async () => {
    const text = llmsText({ name: 'Paws', places: ['Leeds'], brands: [], services: ['dog beds'], bannedWords: [], competitors: [] }, inv({}), new Date('2026-11-26T09:00:00Z'));
    expect(text).toContain('# Paws');
    expect(text).toContain('> Paws: dog beds in Leeds.');
    expect(text).toContain('- [About us](https://shop.test/about/)');
    expect(text).toContain('Updated: 2026-11');
    expect((await gen({ llms_file: true })).items.find((i) => i.type === 'llms_txt')!.status).toBe('keep');
  });
});

describe('emails', () => {
  const base = { domain: 'shop.test', runs: [] as RunSummary[], log: [], mode: 'auto' as const, timezone: 'Europe/London', problems: [], path: '/my/content' };
  it('emails the customer only when they must act, once', () => {
    const now = new Date('2026-11-26T10:00:00Z'); // Thursday
    expect(plannedEmails({ ...base, items: [wi({ status: 'verified', appliedAt: '2026-11-26T09:00:00Z' })], now })).toEqual([]);
    const todo = plannedEmails({ ...base, items: [wi({ status: 'needs_human' }), wi({ status: 'client', label: 'Ask for reviews' })], now });
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ kind: 'action_needed', audience: 'customer' });
    const log = [{ key: todo[0]!.key, kind: 'action_needed' as const, to: 'x', subject: '', sentAt: now.toISOString(), ok: true }];
    expect(plannedEmails({ ...base, items: [wi({ status: 'needs_human' }), wi({ status: 'client', label: 'Ask for reviews' })], log, now })).toEqual([]);
  });
  it('lists approvals in approve mode', () => {
    const e = plannedEmails({ ...base, mode: 'approve', items: [wi({}), wi({})], now: new Date('2026-11-26T10:00:00Z') });
    expect(e[0]!.paragraphs[0]).toBe('2 changes waiting for your approval.');
  });
  it('sends critical alerts to the customer and the team, a Friday summary and a monthly one', () => {
    const run = { id: 'run-1', paused: true, rolledBack: true, problems: ['https://shop.test/ lost its title'] } as RunSummary;
    const crit = plannedEmails({ ...base, runs: [run], items: [], now: new Date('2026-11-26T10:00:00Z') });
    expect(crit.map((e) => e.audience)).toEqual(['customer', 'team']);
    const friday = plannedEmails({ ...base, items: [wi({ status: 'verified', appliedAt: '2026-11-25T09:00:00Z' })], now: new Date('2026-11-27T15:00:00Z') });
    expect(friday[0]).toMatchObject({ kind: 'friday_summary' });
    const monthly = plannedEmails({ ...base, items: [wi({ status: 'verified', appliedAt: '2026-11-25T09:00:00Z' })], now: new Date('2026-12-01T10:00:00Z') });
    expect(monthly[0]).toMatchObject({ kind: 'monthly_summary', key: 'month:2026-11' });
  });
});
