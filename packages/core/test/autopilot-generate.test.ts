import { describe, expect, it } from 'vitest';
import {
  checkAlt,
  checkBlock,
  checkDescription,
  generateWorkItems,
  matchRedirects,
  textProblems,
  workItemId,
  type ActionItem,
  type BusinessProfile,
  type InventoryItem,
  type OpenAiClient,
  type SiteInventory,
  type WpStatus,
} from '../src';
import { parsePageContent } from '../src/audit/page-content';

const site = 'https://shop.test';
const profile: BusinessProfile = { name: 'Paws Beds', places: ['Leeds'], brands: [], services: ['dog beds'], bannedWords: ['cheap'], competitors: ['Barkly'] };

const item = (id: number, path: string, o: Partial<InventoryItem> = {}): InventoryItem => ({
  id, url: `${site}${path}`, type: 'page', name: o.name ?? `Page ${id}`, titleTag: null, seoTitle: null, metaDescription: null, canonical: null,
  noindex: false, nofollow: false, h1s: [], images: [], wordCount: 300, schemaTypes: [], builder: 'gutenberg', isFrontPage: path === '/', modified: null, ...o,
});
const status = { version: '1.4.0', home_url: `${site}/`, sitemap: { url: `${site}/sitemap.xml`, by: 'msscore' } } as unknown as WpStatus;
const inventory = (items: InventoryItem[]): SiteInventory => ({ accountId: 'acc', domain: 'shop.test', platform: 'wordpress', refreshedAt: '', status, items, totals: {}, truncated: false, errors: [] });
const page = (path: string, head: string, body: string) => parsePageContent(`<html><head>${head}</head><body>${body}</body></html>`, `${site}${path}`);

let n = 0;
const action = (title: string, plan: Partial<NonNullable<ActionItem['plan']>> = {}, extra: Partial<ActionItem> = {}): ActionItem => ({
  id: `act-${++n}`, source: { kind: 'ai' } as ActionItem['source'], title, detail: '', severity: 'high', impact: 3, confidence: 3, effort: 2, priority: 4,
  urls: [], owner: null, dueDate: null, approval: 'none', approvedAt: null, approvedBy: null, status: 'todo', bucket: 'd30', bucketLocked: false,
  before: null, doneAt: null, checkpoints: [], createdAt: '', updatedAt: '',
  plan: { taskId: `1.${n}`, month: 1, week: 2, doer: 'automatic', category: 'on_page', why: '', change: '', keywords: [], dependsOn: [], successCheck: '', checkAfterDays: 14, ...plan },
  ...extra,
} as ActionItem);

/** A fake model: answers from a queue of replies, keyed by schema name. */
function fakeAi(replies: Record<string, unknown[]>): OpenAiClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    model: 'fake',
    calls,
    async generateJson(req: { name: string; parse: { parse: (v: unknown) => unknown } }) {
      calls.push(req.name);
      const next = replies[req.name]?.shift();
      if (next === undefined) throw new Error(`no reply for ${req.name}`);
      return { data: req.parse.parse(next), model: 'fake', tokens: 100 };
    },
  } as unknown as OpenAiClient & { calls: string[] };
}

const GOOD_TITLE = 'Orthopaedic Dog Beds Handmade in Leeds | Paws Beds UK';
const GOOD_DESC = 'Orthopaedic dog beds handmade in Leeds with washable covers and memory foam for older dogs. Order online today for delivery across the UK in 3 days.';

describe('quality gate', () => {
  it('flags claims, banned words, competitors and entities', () => {
    expect(textProblems('Guaranteed to cure anxiety, unlike Barkly — so cheap!', profile).join(' ')).toMatch(/claim.*Guaranteed.*banned: cheap.*competitor: Barkly/s);
    expect(textProblems('Dogs &amp; cats', profile)).toContain('contains HTML entities');
  });
  it('accepts a service list or a place as the concrete fact', () => {
    const d = 'Maritime risk advisory, voyage risk assessment, intelligence and voyage planning support for ships in high-risk waters. Discuss your requirements with SRM.';
    expect(checkDescription(d, { others: new Set(), current: null, profile, pageText: '' })).toEqual([]);
    expect(checkDescription(GOOD_DESC, { others: new Set(), current: null, profile, pageText: '' })).toEqual([]);
  });
  it('checks alt text and blocks', () => {
    expect(checkAlt('Grey orthopaedic dog bed on a wooden floor', profile)).toEqual([]);
    expect(checkAlt('image of IMG_2041.jpg', profile).length).toBeGreaterThan(1);
    expect(checkBlock('We have served 5,000 dogs since 1999.', { kind: 'faq', profile, sourceText: 'served dogs since 2001' })[0]).toMatch(/numbers that are not on the site: 5,000, 1999/);
  });
});

describe('generateWorkItems', () => {
  it('keeps passing values, uses the plan draft, re-asks once, then hands failures to a person', async () => {
    const home = item(1, '/', { seoTitle: GOOD_TITLE });
    const beds = item(2, '/dog-beds/');
    const toys = item(3, '/toys/');
    const live = [
      page('/', `<title>${GOOD_TITLE}</title><meta name="description" content="${GOOD_DESC}">`, '<h1>Paws Beds</h1><p>Handmade in Leeds.</p>'),
      page('/dog-beds/', '<title>Beds</title>', '<h1>Dog beds</h1><p>Orthopaedic dog beds handmade in Leeds.</p>'),
      page('/toys/', '<title>Toys</title>', '<h1>Toys</h1><p>Rope toys.</p>'),
    ];
    const titles = action('New titles for 3 pages', { siteWideItem: 'meta_title', pages: [
      { url: `${site}/`, name: 'Homepage', before: '', after: 'Paws Beds' },
      { url: `${site}/dog-beds/`, name: 'Dog beds', before: 'Beds', after: GOOD_TITLE.replace('Orthopaedic', 'Comfy Orthopaedic').slice(0, 59) },
      { url: `${site}/toys/`, name: 'Toys', before: 'Toys', after: 'Toys' },
    ] });
    const ai = fakeAi({ page_meta: [
      { pages: [{ url: `${site}/toys/`, title: 'Cheap Rope Dog Toys Handmade in Leeds for Every Dog Size', description: '' }] },
      { pages: [{ url: `${site}/toys/`, title: 'Cheap Rope Dog Toys Handmade in Leeds for Big and Small Dogs', description: '' }] },
    ] });
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [titles], inventory: inventory([home, beds, toys]), live, profile, keywords: new Map(), deadUrls: [], ai });
    const by = (p: string) => r.items.find((i) => i.url === `${site}${p}`)!;
    expect(by('/')).toMatchObject({ status: 'keep', type: 'meta_title' });
    expect(by('/dog-beds/')).toMatchObject({ status: 'draft', target: { post_id: 2 } });
    expect(by('/toys/')).toMatchObject({ status: 'needs_human' });
    expect(by('/toys/').reason).toMatch(/banned: cheap/);
    expect(ai.calls).toEqual(['page_meta', 'page_meta']);
  });

  it('handles H1s from the content, the theme and page builders', async () => {
    const a = action('One main heading (H1)', { siteWideItem: 'h1' });
    const items = [
      item(1, '/', { h1s: [] }),
      item(2, '/two/', { h1s: ['A', 'B'] }),
      item(3, '/theme/', { h1s: ['Content H1'] }),
      item(4, '/none/', { builder: 'bricks' }),
      item(5, '/themeonly/', { h1s: [] }),
    ];
    const live = [
      page('/', '', '<h1>Home</h1>'),
      page('/two/', '', '<h1>A</h1><h1>B</h1>'),
      page('/theme/', '', '<h1>Theme title</h1><h1>Content H1</h1>'),
      page('/none/', '', '<p>no heading</p>'),
      page('/themeonly/', '', '<h1>One</h1><h1>Two</h1>'),
    ];
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory(items), live, profile, keywords: new Map(), deadUrls: [] });
    const v = (p: string) => r.items.find((i) => i.url === `${site}${p}`)!;
    expect(v('/').status).toBe('keep');
    expect(v('/two/')).toMatchObject({ status: 'draft', newValue: { action: 'demote_extra_h1', keep: 1 } });
    expect(v('/theme/')).toMatchObject({ status: 'draft', newValue: { action: 'demote_extra_h1', keep: 0 } });
    expect(v('/none/')).toMatchObject({ status: 'needs_human' });
    expect(v('/themeonly/')).toMatchObject({ status: 'needs_human' });
  });

  it('swaps the H1 to the page title when the title is an H2 and the line under it the H1', async () => {
    const a = action('One main heading (H1)', { siteWideItem: 'h1' });
    const hero = item(1, '/', { builder: 'bricks', h1s: ['Intelligence-Led Maritime Risk Management'] });
    const live = [page('/', '', '<h2 class="home-hero__title">SRM Risk Management FZCO</h2><h1 class="home-hero__sub">Intelligence-Led Maritime Risk Management</h1><h2>Services</h2>')];
    const st = { ...status, version: '1.4.1' } as WpStatus;
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: { ...inventory([hero]), status: st }, live, profile, keywords: new Map([['shop.test', 'maritime risk management']]), deadUrls: [] });
    const swap = r.items.find((i) => (i.newValue as { action?: string } | null)?.action === 'swap_h1')!;
    expect(swap).toMatchObject({ status: 'draft', week: 1, newValue: { action: 'swap_h1', title: 'SRM Risk Management FZCO' } });
    // The words check runs on the promoted title, after the swap.
    const words = r.items.find((i) => (i.newValue as { action?: string } | null)?.action === 'set_h1_text');
    expect(words?.before).toBe('SRM Risk Management FZCO');
    expect(words?.dependsOn).toEqual([swap.id]);
    // An older plugin cannot swap: a person is told to update it.
    const old = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([hero]), live, profile, keywords: new Map(), deadUrls: [] });
    expect(old.items.find((i) => (i.newValue as { action?: string } | null)?.action === 'swap_h1')).toMatchObject({ status: 'needs_human', reason: expect.stringMatching(/1\.4\.1/) });
  });

  it('drafts a direct answer for Gutenberg and Bricks pages, but leaves Divi to a person', async () => {
    const answer = 'Paws Beds makes orthopaedic dog beds by hand in Leeds, with memory foam and washable covers for older dogs and dogs with sore joints. Every bed is cut to size for your dog, and you can order online for delivery across the UK.';
    const ai = fakeAi({ content_block: [{ answer, faq: [] }, { answer, faq: [] }] });
    const live = [page('/', '', '<h1>Paws Beds</h1><p>Handmade in Leeds with memory foam and washable covers for older dogs.</p>'), page('/b/', '', '<h1>B</h1><p>Beds made in Leeds.</p>')];
    const r = await generateWorkItems({
      accountId: 'acc', domain: 'shop.test',
      actions: [action('Direct answer at the top of Homepage', {}, { urls: [`${site}/`, `${site}/b/`] })],
      inventory: inventory([item(1, '/'), item(2, '/b/', { builder: 'divi' })]), live, profile, keywords: new Map(), deadUrls: [], ai,
    });
    expect(r.items[0]).toMatchObject({ type: 'content_block', status: 'draft', newValue: { kind: 'answer', position: 'after_h1' } });
    expect(r.items[1]).toMatchObject({ status: 'needs_human' });
    expect(r.items[1]!.reason).toMatch(/divi/);
  });

  it('maps dead addresses to the closest live page, or asks a person', () => {
    const m = matchRedirects(
      [{ url: `${site}/old-orthopaedic-dog-beds/`, why: 'clicks' }, { url: `${site}/xyz-123/`, why: 'links' }],
      [{ url: `${site}/dog-beds/`, name: 'Orthopaedic dog beds' }, { url: `${site}/toys/`, name: 'Toys' }],
    );
    expect(m[0]).toMatchObject({ to: `${site}/dog-beds/` });
    expect(m[1]!.to).toBeNull();
  });

  it('makes redirects in week 1, canonicals before titles, and stable ids', async () => {
    const items = [item(1, '/'), item(2, '/beds/')];
    const live = [page('/', '<title>Home</title>', '<h1>Home</h1>'), page('/beds/', `<title>Beds</title><link rel="canonical" href="${site}/other/">`, '<h1>Beds</h1>')];
    const actions = [
      action('Canonical tags', { siteWideItem: 'canonical', week: 1 }, { urls: [`${site}/beds/`] }),
      action('New titles', { siteWideItem: 'meta_title', pages: [{ url: `${site}/beds/`, name: 'Beds', before: 'Beds', after: GOOD_TITLE }] }),
    ];
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions, inventory: inventory(items), live, profile, keywords: new Map(), deadUrls: [{ url: `${site}/bed/`, why: '404 with links' }] });
    const canonical = r.items.find((i) => i.type === 'canonical')!;
    const title = r.items.find((i) => i.type === 'meta_title')!;
    const redirect = r.items.find((i) => i.type === 'redirect_301')!;
    expect(canonical).toMatchObject({ status: 'draft', newValue: `${site}/beds/` });
    expect(title.dependsOn).toEqual([canonical.id]);
    expect(redirect).toMatchObject({ status: 'draft', week: 1, newValue: { to: `${site}/beds/` } });
    expect(workItemId('shop.test', 'a', 'meta_title', { post_id: 1 }, 'x')).toBe(workItemId('shop.test', 'a', 'meta_title', { post_id: 1 }, 'x'));
    expect(workItemId('shop.test', 'a', 'meta_title', { post_id: 1 }, 'x')).not.toBe(workItemId('shop.test', 'a', 'meta_title', { post_id: 1 }, 'y'));
  });

  it('turns team, client and developer tasks into notes, not website changes', async () => {
    const r = await generateWorkItems({
      accountId: 'acc', domain: 'shop.test',
      actions: [action('Verify font loading', { doer: 'developer' }), action('Add your phone number', { doer: 'client' }), action('Submit the verified sitemap')],
      inventory: inventory([item(1, '/')]), live: [], profile, keywords: new Map(), deadUrls: [],
    });
    expect(r.items.map((i) => [i.type, i.status])).toEqual(expect.arrayContaining([['manual', 'developer'], ['manual', 'client'], ['gsc_sitemap_submit', 'draft']]));
  });
});

describe('sections and new pages (plugin 1.4.0)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => ['memory', 'foam', 'beds', 'support', 'older', 'dogs', 'joints', 'washable'][i % 8]).join(' ');
  const body = '<h1>Orthopaedic dog beds</h1><p>Handmade in Leeds with memory foam and washable covers for older dogs.</p>';
  it('drafts a section for a Bricks or Elementor page and sends it (no longer "needs a person")', async () => {
    const home = item(1, '/', { builder: 'bricks' });
    const a = action('Add a why choose us section to the homepage', {}, { urls: [`${site}/`] });
    const ai = fakeAi({ page_section: [{ heading: 'Why dog owners choose us', paragraphs: [words(80)], bullets: ['Memory foam', 'Washable covers'], table: { headers: [], rows: [] } }] });
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([home]), live: [page('/', '<title>x</title>', body)], profile, keywords: new Map(), deadUrls: [], ai });
    const s = r.items.find((i) => i.type === 'content_block')!;
    expect(s).toMatchObject({ status: 'draft', target: { post_id: 1 } });
    expect(String((s.newValue as { html: string }).html)).toContain('<h2>Why dog owners choose us</h2>');
  });
  it('never writes testimonials: a person sends real ones', async () => {
    const a = action('Add a testimonials section to the homepage', {}, { urls: [`${site}/`] });
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([item(1, '/', { builder: 'elementor' })]), live: [page('/', '<title>x</title>', body)], profile, keywords: new Map(), deadUrls: [], ai: fakeAi({}) });
    const t = r.items.find((i) => i.type === 'content_block');
    expect(t).toMatchObject({ status: 'needs_human', reason: expect.stringMatching(/must be real/) });
  });
  it('drafts a new page from the page plan and saves it as a WordPress draft', async () => {
    const a = action('Create a new page for orthopaedic dog beds for older dogs');
    const ai = fakeAi({ new_page: [{
      h1: 'Orthopaedic Dog Beds for Older Dogs', metaTitle: 'Orthopaedic Dog Beds for Older Dogs Made in Leeds | Paws', metaDescription: 'Orthopaedic dog beds for older dogs, handmade in Leeds with memory foam and washable covers. Ease stiff joints and order your dog a better bed today.',
      intro: words(50), sections: [{ heading: 'Memory foam support', paragraphs: [words(90)], bullets: [] }, { heading: 'Washable covers', paragraphs: [words(90)], bullets: [] }, { heading: 'Made in Leeds', paragraphs: [words(90)], bullets: ['Handmade'] }],
      faq: [{ q: 'Are the covers washable?', a: 'Yes, every cover is washable.' }],
    }] });
    const newPages = [{ path: '/orthopaedic-dog-beds/', mainKeyword: 'orthopaedic dog beds', secondary: ['beds for older dogs'], questions: [], pageType: 'category' }];
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([item(1, '/')]), live: [page('/', '<title>x</title>', body)], profile, keywords: new Map(), deadUrls: [], ai, newPages });
    const p = r.items.find((i) => i.type === 'create_page')!;
    expect(p).toMatchObject({ status: 'draft', target: { site: true } });
    expect(p.newValue).toMatchObject({ slug: 'orthopaedic-dog-beds', title: 'Orthopaedic Dog Beds for Older Dogs' });
    // The same page already on the site: nothing to make.
    const again = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([item(1, '/'), item(2, '/orthopaedic-dog-beds/')]), live: [], profile, keywords: new Map(), deadUrls: [], ai: fakeAi({}), newPages });
    expect(again.items.find((i) => i.type === 'create_page')).toMatchObject({ status: 'keep' });
  });
});

describe('direct answer without a passing AI draft (Bricks homepage)', () => {
  const body = '<h1>SRM Risk Management</h1><p>Dubai-based maritime risk management for ships transiting the Red Sea.</p><div>More about SRMWhere Our Support Is FocusedHover over a region.</div><p>We provide risk management support and maritime security-related services to ships transiting high-risk areas, together with shipping operations support.</p>';
  const head = '<title>SRM</title><meta name="description" content="Dubai-based maritime risk management and shipping operations support for vessels in the Red Sea, Gulf of Aden, Arabian Sea and Indian Ocean.">';
  it('builds the answer from the page’s own sentences and sends it to the Bricks page', async () => {
    const a = action('Direct answer at the top of Homepage', { doer: 'team' }, { urls: [`${site}/`] });
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [a], inventory: inventory([item(1, '/', { builder: 'bricks' })]), live: [page('/', head, body)], profile, keywords: new Map(), deadUrls: [], ai: fakeAi({}) });
    const it2 = r.items.find((i) => i.type === 'content_block')!;
    expect(it2).toMatchObject({ status: 'draft', newValue: { position: 'after_h1' }, reason: expect.stringMatching(/sentences already on the page/) });
    const text = String((it2.newValue as { html: string }).html);
    expect(text).toContain('Dubai-based maritime risk management and shipping operations support');
    expect(text).toContain('We provide risk management support');
    expect(text).not.toMatch(/Hover|SRMWhere/);
  });
  it('asks for plugin 1.4.0 on builder pages with an older plugin', async () => {
    const old = { ...inventory([item(1, '/', { builder: 'bricks' })]) };
    old.status = { ...old.status, version: '1.3.3' } as WpStatus;
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [action('Direct answer at the top of Homepage', {}, { urls: [`${site}/`] })], inventory: old, live: [page('/', head, body)], profile, keywords: new Map(), deadUrls: [] });
    expect(r.items.find((i) => i.type === 'content_block')).toMatchObject({ status: 'needs_human', reason: expect.stringMatching(/1\.4\.0/) });
  });
  it('leaves a page that already opens with a 40–80 word answer', async () => {
    const answer = Array.from({ length: 50 }, () => 'support').join(' ');
    const r = await generateWorkItems({ accountId: 'acc', domain: 'shop.test', actions: [action('Direct answer at the top of Homepage', {}, { urls: [`${site}/`] })], inventory: inventory([item(1, '/')]), live: [page('/', head, `<h1>SRM</h1><p>${answer}.</p>`)], profile, keywords: new Map(), deadUrls: [] });
    expect(r.items.find((i) => i.type === 'content_block')).toMatchObject({ status: 'keep' });
  });
});
