import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  collectInventory,
  createWordPressClient,
  inventoryDue,
  inventorySummary,
  newSigningKey,
  pluginSupportsSigning,
  statusAlerts,
  wpCanonicalQuery,
  wpSignature,
  type SiteConnection,
  type WpInventoryItem,
  type WpStatus,
} from '../src';
import { decryptSecret, encryptSecret, wordpressSession } from '../src/server';

const status = (over: Partial<WpStatus> = {}): WpStatus => ({
  version: '1.1.0', seo: 'yoast', seo_plugin: 'yoast', wp_version: '6.7', php_version: '8.2',
  theme: { name: 'Astra', version: '4.8', template: 'astra', title_tag: true },
  page_builder: 'gutenberg', page_builders: ['gutenberg'], cache_plugins: [], woocommerce: true,
  sitemap: { url: 'https://shop.test/sitemap_index.xml', by: 'yoast' }, robots_file: false, llms_file: false,
  search_visible: true, home_url: 'https://shop.test/', signed: true, inventory_types: ['page', 'product'],
  ...over,
});
const item = (id: number, type = 'page', over: Partial<WpInventoryItem> = {}): WpInventoryItem => ({
  id, url: `https://shop.test/${type}-${id}/`, type, name: `Item ${id}`, title_tag: null, seo_title: id % 2 ? 'SEO title' : null,
  meta_description: null, canonical: null, robots: { noindex: false, nofollow: false }, h1s: [],
  images: [{ id: 5, url: 'https://shop.test/a.jpg', alt: '', featured: true }], word_count: 120, schema_types: ['WebPage'],
  builder: 'gutenberg', is_front_page: id === 1, modified: null, ...over,
});

describe('signed requests (must match the plugin)', () => {
  it('builds the same query and signature as signing.php', async () => {
    const query = wpCanonicalQuery({ type: 'page', page: '2', rest_route: '/msscore/v1/inventory', q: "a b!'()*" });
    expect(query).toBe('page=2&q=a%20b%21%27%28%29%2A&type=page');
    // Same vector as integrations/wordpress/tests/signing-test.php.
    const sig = await wpSignature('k'.repeat(43), '1700000000', 'GET', '/msscore/v1/inventory', query, '');
    expect(sig).toBe('a44a0df6b5790d3a0188048e693182aa9d9ae8be587f47dec117da753166eafc');
  });

  it('makes url-safe 43-character keys', () => {
    const k = newSigningKey();
    expect(k).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSigningKey()).not.toBe(k);
  });

  it('knows which plugin versions sign', () => {
    expect(pluginSupportsSigning('1.0.0')).toBe(false);
    expect(pluginSupportsSigning('1.1.0')).toBe(true);
    expect(pluginSupportsSigning('2.0')).toBe(true);
    expect(pluginSupportsSigning(null)).toBe(false);
  });
});

describe('WordPress client signing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs plugin calls (with the exact body sent) but not WordPress core calls', async () => {
    const seen: { url: string; headers: Record<string, string>; body?: string; method?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: init.body as string | undefined, method: init.method });
      return new Response(JSON.stringify(url.includes('users/me') ? { id: 1, roles: ['editor'] } : { ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const key = 'x'.repeat(43);
    const wp = createWordPressClient({ siteUrl: 'https://shop.test', user: 'u', password: 'p', signingKey: key });
    await wp.setKey('y'.repeat(43));
    await wp.me();
    const [signed, core] = seen;
    expect(signed!.headers['x-msscore-signature']).toMatch(/^[0-9a-f]{64}$/);
    const ts = signed!.headers['x-msscore-timestamp']!;
    expect(await wpSignature(key, ts, 'POST', '/msscore/v1/key', '', signed!.body!)).toBe(signed!.headers['x-msscore-signature']);
    expect(JSON.parse(signed!.body!)).toEqual({ key: 'y'.repeat(43) });
    expect(core!.headers['x-msscore-signature']).toBeUndefined();
    expect(core!.headers.authorization).toMatch(/^Basic /);
  });

  it('signs the query string of inventory calls', async () => {
    let captured: { url: string; headers: Record<string, string> } | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ type: 'page', page: 2, per_page: 100, total: 0, total_pages: 0, items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const key = 'z'.repeat(43);
    await createWordPressClient({ siteUrl: 'https://shop.test/', user: 'u', password: 'p', signingKey: key }).inventory('page', 2, 100);
    const c = captured!;
    expect(c.url).toBe('https://shop.test/wp-json/msscore/v1/inventory?type=page&page=2&per_page=100');
    const expected = await wpSignature(key, c.headers['x-msscore-timestamp']!, 'GET', '/msscore/v1/inventory', 'page=2&per_page=100&type=page', '');
    expect(c.headers['x-msscore-signature']).toBe(expected);
  });
});

describe('inventory', () => {
  it('reads every type page by page and keeps the account and domain', async () => {
    const calls: string[] = [];
    const wp = {
      status: async () => status(),
      inventory: async (type: string, page: number) => {
        calls.push(`${type}:${page}`);
        if (type === 'page') return { type, page, per_page: 100, total: 150, total_pages: 2, items: page === 1 ? Array.from({ length: 100 }, (_, i) => item(i + 1)) : Array.from({ length: 50 }, (_, i) => item(i + 101)) };
        return { type, page, per_page: 100, total: 1, total_pages: 1, items: [item(900, 'product')] };
      },
    };
    const inv = await collectInventory(wp, { accountId: 'acc1', domain: 'shop.test', now: new Date('2026-11-25T00:00:00Z') });
    expect(calls).toEqual(['page:1', 'page:2', 'product:1']);
    expect(inv).toMatchObject({ accountId: 'acc1', domain: 'shop.test', truncated: false, errors: [], totals: { page: 150, product: 1 } });
    expect(inv.items).toHaveLength(151);
    expect(inv.items[0]).toMatchObject({ id: 1, isFrontPage: true, titleTag: null, noindex: false, wordCount: 120 });
    const sum = inventorySummary(inv);
    expect(sum.byType).toEqual([{ type: 'page', count: 150 }, { type: 'product', count: 1 }]);
    expect(sum.imagesWithoutAlt).toBe(151);
    expect(sum.missingDescription).toBe(151);
  });

  it('stops at the item limit and notes types that fail', async () => {
    const wp = {
      status: async () => status({ inventory_types: ['post', 'page', 'product'] }),
      inventory: async (type: string, page: number) => {
        if (type === 'post') throw new Error('timeout');
        return { type, page, per_page: 100, total: 300, total_pages: 3, items: Array.from({ length: 100 }, (_, i) => item(page * 1000 + i, type)) };
      },
    };
    const inv = await collectInventory(wp, { accountId: 'team', domain: 'shop.test', maxItems: 150 });
    expect(inv.items).toHaveLength(150);
    expect(inv.truncated).toBe(true);
    expect(inv.errors).toEqual(['post: timeout']);
  });

  it('is read again after a week', () => {
    const now = new Date('2026-11-25T00:00:00Z');
    expect(inventoryDue(null, now)).toBe(true);
    expect(inventoryDue({ refreshedAt: '2026-11-20T00:00:00Z' }, now)).toBe(false);
    expect(inventoryDue({ refreshedAt: '2026-11-17T00:00:00Z' }, now)).toBe(true);
  });

  it('flags "Discourage search engines" as critical', () => {
    expect(statusAlerts(status({ search_visible: false }))[0]).toMatchObject({ level: 'critical' });
    expect(statusAlerts(status())).toEqual([]);
    expect(statusAlerts(status({ seo_plugin: 'none', theme: { name: 'Old', version: '1', template: 'old', title_tag: false } }))[0]).toMatchObject({ level: 'warning' });
  });
});

describe('first signing key', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  afterEach(() => vi.unstubAllGlobals());

  const conn = (secret: object, version = '1.1.0'): SiteConnection => ({
    domain: 'shop.test', platform: 'wordpress', siteUrl: 'https://shop.test', account: 'editor', secret: encryptSecret(JSON.stringify(secret)),
    scopes: null, plugin: { version, seo: 'yoast' }, status: 'ok', error: null, connectedAt: '', connectedBy: 'Team', checkedAt: '',
  });

  it('gives a 1.1.0 plugin a key once, unsigned, and saves it encrypted', async () => {
    const bodies: { headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push({ headers: init.headers as Record<string, string>, body: init.body as string });
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const saved: SiteConnection[] = [];
    const { connection } = await wordpressSession(conn({ password: 'pw' }), { save: async (c) => void saved.push(c) });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.headers['x-msscore-signature']).toBeUndefined();
    const key = (JSON.parse(bodies[0]!.body) as { key: string }).key;
    expect(saved).toHaveLength(1);
    expect(JSON.parse(decryptSecret(connection.secret))).toEqual({ password: 'pw', signingKey: key });
  });

  it('does nothing for a plugin that already has a key, or an old plugin', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const save = vi.fn();
    await wordpressSession(conn({ password: 'pw', signingKey: 'k'.repeat(43) }), { save });
    await wordpressSession(conn({ password: 'pw' }, '1.0.0'), { save });
    expect(f).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
