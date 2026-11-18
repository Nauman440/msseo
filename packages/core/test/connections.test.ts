import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChanges, briefHtml, canApply, checkVisible, undoChanges, wordpressAuthorizeUrl, type ActionItem, type SiteAdapter, type SiteResource } from '../src';
import { createShopifyClient, decryptSecret, encryptSecret, normShop, refreshShopifyToken, shopifyAuthorizeUrl, shopifyTokenStale, verifyShopifyHmac } from '../src/server';
import { parsePageContent } from '../src/audit/page-content';

/** Spec §16.5: WordPress and Shopify connections, applying approved changes and undoing them. */
afterEach(() => vi.unstubAllGlobals());
const NOW = new Date('2026-11-18T12:00:00Z');

describe('Shopify connect checks', () => {
  it('normalises store names and builds the approval address', () => {
    expect(normShop('my-store')).toBe('my-store.myshopify.com');
    expect(normShop('https://My-Store.myshopify.com/admin')).toBe('my-store.myshopify.com');
    expect(normShop('https://admin.shopify.com/store/my-store/products')).toBe('my-store.myshopify.com');
    // Another host with a myshopify path is not a store name.
    expect(normShop('evil.com/x.myshopify.com')).toBeNull();
    expect(normShop('bad store!')).toBeNull();
    const url = new URL(shopifyAuthorizeUrl({ clientId: 'cid', clientSecret: 's' }, 'my-store.myshopify.com', 'https://msseo.tech/api/connections/shopify/callback', 'n1'));
    expect(url.origin).toBe('https://my-store.myshopify.com');
    expect(url.searchParams.get('scope')).toContain('write_products');
    expect(url.searchParams.get('state')).toBe('n1');
  });

  it('verifies the callback HMAC (sorted parameters, hmac removed)', () => {
    const secret = 'shhh';
    const params = new URLSearchParams({ code: 'abc', shop: 'my-store.myshopify.com', state: 'n1', timestamp: '1700000000' });
    const msg = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
    params.set('hmac', createHmac('sha256', secret).update(msg).digest('hex'));
    expect(verifyShopifyHmac(params, secret)).toBe(true);
    params.set('shop', 'other.myshopify.com');
    expect(verifyShopifyHmac(params, secret)).toBe(false);
    expect(verifyShopifyHmac(new URLSearchParams({ shop: 'x' }), secret)).toBe(false);
  });

  it('refreshes expiring tokens and keeps the rotated refresh token', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('r1');
      return new Response(JSON.stringify({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600, scope: 'write_products' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const s = await refreshShopifyToken({ clientId: 'c', clientSecret: 's' }, 'my-store.myshopify.com', 'r1', undefined, NOW);
    expect(s).toEqual({ accessToken: 'a2', refreshToken: 'r2', expiresAt: '2026-11-18T13:00:00.000Z' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://my-store.myshopify.com/admin/oauth/access_token');
    expect(shopifyTokenStale(s, new Date('2026-11-18T12:56:00Z'))).toBe(true);
    expect(shopifyTokenStale(s, new Date('2026-11-18T12:30:00Z'))).toBe(false);
    expect(shopifyTokenStale({ accessToken: 'x', refreshToken: null, expiresAt: null })).toBe(false);
  });

  it('finds a product by its address and updates its SEO fields', async () => {
    const calls: { query: string; variables?: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body)) as { query: string; variables?: Record<string, unknown> };
      calls.push(b);
      if (b.query.includes('products(first: 1')) return new Response(JSON.stringify({ data: { products: { nodes: [{ id: 'gid://shopify/Product/7', title: 'Linen Duvet', seo: { title: null, description: 'Old' } }] } } }));
      return new Response(JSON.stringify({ data: { productUpdate: { userErrors: [] } } }));
    }));
    const shop = createShopifyClient({ shop: 'my-store.myshopify.com', token: async () => 'tok' });
    const r = await shop.find('https://foldandfeel.co.uk/collections/bedding/products/linen-duvet');
    expect(r).toMatchObject({ id: 'gid://shopify/Product/7', kind: 'product', seoDescription: 'Old', editUrl: 'https://my-store.myshopify.com/admin/products/7' });
    expect(calls[0]!.variables).toEqual({ q: 'handle:"linen-duvet"' });
    await shop.setSeo(r!, { title: 'Linen Duvet Covers | Fold & Feel' });
    expect(calls[1]!.variables).toEqual({ p: { id: 'gid://shopify/Product/7', seo: { title: 'Linen Duvet Covers | Fold & Feel', description: 'Old' } } });
    expect(await shop.find('https://foldandfeel.co.uk/')).toBeNull();
  });
});

describe('WordPress connect check', () => {
  it('reads the Application Passwords address from the REST index', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: 'https://myhvac.com', authentication: { 'application-passwords': { endpoints: { authorization: 'https://myhvac.com/wp-admin/authorize-application.php' } } } }))));
    expect(await wordpressAuthorizeUrl('https://myhvac.com/')).toEqual({ url: 'https://myhvac.com/wp-admin/authorize-application.php' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: 'https://myhvac.com', authentication: [] }))));
    expect(await wordpressAuthorizeUrl('https://myhvac.com')).toMatchObject({ error: expect.stringContaining('Application Passwords are turned off') });
    expect(await wordpressAuthorizeUrl('http://myhvac.com')).toMatchObject({ error: expect.stringContaining('https') });
  });
});

describe('applying approved changes', () => {
  const action = (changes: ActionItem['changes'], urls = ['https://myhvac.com/services/heat-pumps/']): ActionItem => ({
    id: 'a1', source: { kind: 'mapping', clusterId: 'hp' }, title: 'Optimise', detail: '', severity: 'medium', impact: 3, confidence: 4, effort: 2, priority: 6, urls,
    owner: null, dueDate: null, approval: 'client', approvedAt: NOW.toISOString(), approvedBy: 'Client', status: 'todo', bucket: 'd30', bucketLocked: false, before: null,
    doneAt: null, checkpoints: [], changes, createdAt: '', updatedAt: '',
  });
  const fakeSite = () => {
    const page: SiteResource = { id: '42', kind: 'page', title: 'Heat Pumps', seoTitle: 'Old title', seoDescription: null, editUrl: null };
    const log: string[] = [];
    const site: SiteAdapter = {
      platform: 'wordpress',
      find: async (u) => (u.includes('heat-pumps') ? page : null),
      setSeo: async (r, v) => {
        log.push(`seo ${JSON.stringify(v)}`);
        if (v.title !== undefined) page.seoTitle = v.title;
        if (v.description !== undefined) page.seoDescription = v.description;
      },
      setTitle: async (r, t) => {
        log.push(`title ${t}`);
        page.title = t;
      },
      createRedirect: async (f, t) => {
        log.push(`redirect ${f} -> ${t}`);
        return 'r1';
      },
      deleteRedirect: async (id) => void log.push(`unredirect ${id}`),
      createDraft: async (p) => {
        log.push(`draft ${p.path} ${p.title}`);
        return { id: '99', editUrl: 'https://myhvac.com/wp-admin/post.php?post=99&action=edit' };
      },
      deleteDraft: async (id) => void log.push(`undraft ${id}`),
    };
    return { site, page, log };
  };

  it('applies title, meta and H1, leaves copy changes to a person, and undoes everything', async () => {
    const a = action([
      { id: 'title', label: 'Title tag', now: 'Old title', suggested: 'Heat Pump Installation in Dallas | MyHVAC' },
      { id: 'meta', label: 'Meta description', now: '(missing)', suggested: 'Licensed heat pump installation in Dallas.' },
      { id: 'h1', label: 'H1 heading', now: 'Heat Pumps', suggested: 'Heat Pump Installation in Dallas' },
      { id: 'section', label: 'New section', now: '', suggested: 'H2 "Heat Pump Cost"' },
    ]);
    const { site, page, log } = fakeSite();
    const rec = await applyChanges(a, site, 'Client', NOW);
    expect(rec.results.map((r) => [r.id, r.status])).toEqual([['title', 'applied'], ['meta', 'applied'], ['h1', 'applied'], ['section', 'manual']]);
    expect(page).toMatchObject({ seoTitle: 'Heat Pump Installation in Dallas | MyHVAC', title: 'Heat Pump Installation in Dallas' });

    const html = '<html><head><title>Heat Pump Installation in Dallas | MyHVAC</title><meta name="description" content="Old"></head><body><h1>Heat Pump Installation in Dallas</h1></body></html>';
    const seen = checkVisible(rec, a, parsePageContent(html, a.urls[0]!));
    expect(seen.results.map((r) => r.visible)).toEqual([true, false, true, undefined]);

    const undone = await undoChanges(rec, a, site, NOW);
    expect(undone.results.map((r) => r.status)).toEqual(['undone', 'undone', 'undone', 'manual']);
    expect(page).toMatchObject({ seoTitle: 'Old title', seoDescription: '', title: 'Heat Pumps' });
    expect(log).toHaveLength(6);
  });

  it('creates a draft for a new page, redirects merged pages, and reports pages it cannot find', async () => {
    const { site, log } = fakeSite();
    const draft = action([{ id: 'brief', label: 'New page', now: 'No page yet', suggested: 'Service page', data: { path: '/services/furnace-repair/', title: 'Furnace Repair | MyHVAC', h1: 'Furnace Repair in Dallas', meta: 'm', html: '<p>x</p>' } }], []);
    const r1 = await applyChanges(draft, site, 'Team', NOW);
    expect(r1.results[0]).toMatchObject({ status: 'applied', ref: '99' });
    const merge = action([{ id: 'retarget', label: 'Merge', now: '/old/', suggested: 'Redirect' }], ['https://myhvac.com/services/heat-pumps/', 'https://myhvac.com/blog/heat-pump-tips/']);
    const r2 = await applyChanges(merge, site, 'Team', NOW);
    expect(r2.results[0]).toMatchObject({ status: 'applied', ref: 'r1' });
    expect(log).toEqual(['draft /services/furnace-repair/ Furnace Repair in Dallas', 'redirect /blog/heat-pump-tips/ -> /services/heat-pumps/']);
    // "Other page" (give it another keyword) is a copy change: never automatic.
    expect(canApply({ id: 'retarget', label: 'Other page', now: '', suggested: '' })).toBe(false);
    const missing = await applyChanges(action([{ id: 'title', label: 'Title tag', now: '', suggested: 'X' }], ['https://myhvac.com/gone/']), site, 'Team', NOW);
    expect(missing.results[0]).toMatchObject({ status: 'failed', note: '/gone/ was not found on the site.' });
  });

  it('escapes the brief skeleton and keeps secrets encrypted', () => {
    expect(briefHtml({ h1: 'x', outline: ['Cost <2026>'], faq: [], mustHave: ['a'] })).toContain('<h2>Cost &lt;2026&gt;</h2>');
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const enc = encryptSecret('app-password-123');
    expect(enc).not.toContain('app-password');
    expect(decryptSecret(enc)).toBe('app-password-123');
  });
});
