import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ShopifySecret, SiteAdapter, SiteResource } from '../connections/types';
import { requestJson, type HttpLog } from './http';

/**
 * Shopify client (spec §16.5), checked against shopify.dev (2026-11): authorization code grant with
 * HMAC + state + shop checks; **expiring offline tokens** (`expiring=1`: 1-hour access token plus a
 * rotating refresh token, `grant_type=refresh_token`); Admin GraphQL API 2026-10. SEO: products and
 * collections through their `seo` input, pages and articles through the `global.title_tag` /
 * `global.description_tag` metafields (`metafieldsSet`, an upsert). Redirects: `urlRedirectCreate`.
 * The theme is never edited.
 */
export const SHOPIFY_API_VERSION = '2026-10';
export const SHOPIFY_SCOPES = ['read_products', 'write_products', 'read_content', 'write_content', 'read_online_store_navigation', 'write_online_store_navigation'];
export const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export type ShopifyApp = { clientId: string; clientSecret: string };

/** "my-store", "my-store.myshopify.com" or its admin address → "my-store.myshopify.com" (or null). */
export function normShop(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const admin = /^admin\.shopify\.com$/.test(s) ? input.match(/store\/([a-z0-9-]+)/i)?.[1] : null;
  if (admin) s = admin;
  if (!s.endsWith('.myshopify.com')) s = `${s}.myshopify.com`;
  return SHOP_RE.test(s) ? s : null;
}

export function shopifyAuthorizeUrl(app: ShopifyApp, shop: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: app.clientId, scope: SHOPIFY_SCOPES.join(','), redirect_uri: redirectUri, state });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

/** The callback's hmac: HMAC-SHA256 (client secret) of the other parameters, sorted, joined as a query string. */
export function verifyShopifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac');
  if (!hmac) return false;
  const rest = [...params.entries()].filter(([k]) => k !== 'hmac' && k !== 'signature').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = rest.map(([k, v]) => `${k}=${v}`).join('&');
  const digest = createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(hmac, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const tokenResponse = z.object({
  access_token: z.string(),
  scope: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
}).passthrough();

const toSecret = (t: z.infer<typeof tokenResponse>, now: Date): ShopifySecret => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? null,
  expiresAt: t.expires_in ? new Date(now.getTime() + t.expires_in * 1000).toISOString() : null,
});

async function tokenCall(shop: string, form: Record<string, string>, log?: HttpLog) {
  return tokenResponse.parse(
    await requestJson(`https://${shop}/admin/oauth/access_token`, {
      provider: 'shopify',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      rawBody: new URLSearchParams(form).toString(),
      timeoutMs: 20_000,
      retries: 0,
      log,
    }),
  );
}

export async function exchangeShopifyCode(app: ShopifyApp, shop: string, code: string, log?: HttpLog, now = new Date()): Promise<{ secret: ShopifySecret; scope: string }> {
  const t = await tokenCall(shop, { client_id: app.clientId, client_secret: app.clientSecret, code, expiring: '1' }, log);
  return { secret: toSecret(t, now), scope: t.scope ?? '' };
}

/** New access + refresh token (the refresh token rotates: store both). */
export async function refreshShopifyToken(app: ShopifyApp, shop: string, refreshToken: string, log?: HttpLog, now = new Date()): Promise<ShopifySecret> {
  return toSecret(await tokenCall(shop, { client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }, log), now);
}

/** True when the access token expires within 5 minutes (non-expiring tokens never do). */
export const shopifyTokenStale = (s: ShopifySecret, now = new Date()) => Boolean(s.expiresAt && Date.parse(s.expiresAt) - now.getTime() < 5 * 60_000);

type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
const userErrors = (e: { message: string }[] | undefined) => {
  if (e?.length) throw new Error(e.map((x) => x.message).join('; ').slice(0, 200));
};

export type ShopifyClient = SiteAdapter & { shop(): Promise<{ name: string; primaryHost: string; myshopify: string }> };

/** `token` returns a fresh access token (refreshing when needed). */
export function createShopifyClient(cfg: { shop: string; token: () => Promise<string>; log?: HttpLog }): ShopifyClient {
  const endpoint = `https://${cfg.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const gql: Gql = async <T>(query: string, variables?: Record<string, unknown>) => {
    const r = await requestJson<{ data?: T; errors?: { message: string }[] }>(endpoint, {
      provider: 'shopify',
      method: 'POST',
      headers: { 'x-shopify-access-token': await cfg.token() },
      body: { query, variables },
      timeoutMs: 20_000,
      retries: 1,
      log: cfg.log,
    });
    if (r.errors?.length) throw new Error(`Shopify: ${r.errors.map((e) => e.message).join('; ').slice(0, 200)}`);
    return r.data as T;
  };

  type Node = { id: string; title: string; seo?: { title: string | null; description: string | null } | null; titleTag?: { value: string } | null; descTag?: { value: string } | null };
  const META = 'titleTag: metafield(namespace: "global", key: "title_tag") { value } descTag: metafield(namespace: "global", key: "description_tag") { value }';
  const FIELDS: Record<string, string> = {
    products: 'id title seo { title description }',
    collections: 'id title seo { title description }',
    pages: `id title ${META}`,
    articles: `id title ${META}`,
  };
  const KIND: Record<string, string> = { products: 'product', collections: 'collection', pages: 'page', articles: 'article' };
  const lookup = async (conn: string, handle: string): Promise<SiteResource | null> => {
    const q = `query($q: String!) { ${conn}(first: 1, query: $q) { nodes { ${FIELDS[conn]} } } }`;
    const d = await gql<Record<string, { nodes: Node[] }>>(q, { q: `handle:${JSON.stringify(handle)}` });
    const n = d[conn]?.nodes[0];
    if (!n) return null;
    const numeric = n.id.split('/').pop();
    const adminPath = { products: 'products', collections: 'collections', pages: 'pages', articles: 'articles' }[conn];
    return {
      id: n.id,
      kind: KIND[conn]!,
      title: n.title,
      seoTitle: n.seo ? n.seo.title : n.titleTag?.value ?? null,
      seoDescription: n.seo ? n.seo.description : n.descTag?.value ?? null,
      editUrl: `https://${cfg.shop}/admin/${adminPath}/${numeric}`,
    };
  };

  const setMeta = async (ownerId: string, key: 'title_tag' | 'description_tag', value: string) => {
    const d = await gql<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      'mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message code } } }',
      { m: [{ ownerId, namespace: 'global', key, type: 'single_line_text_field', value }] },
    );
    userErrors(d.metafieldsSet.userErrors);
  };

  return {
    platform: 'shopify',
    async shop() {
      const d = await gql<{ shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string } } }>('{ shop { name myshopifyDomain primaryDomain { host } } }');
      return { name: d.shop.name, primaryHost: d.shop.primaryDomain.host, myshopify: d.shop.myshopifyDomain };
    },
    async find(url) {
      let path: string;
      try {
        path = new URL(url).pathname.replace(/\/+$/, '');
      } catch {
        return null;
      }
      const seg = path.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
      // /collections/<c>/products/<p> is a product shown inside a collection.
      if (seg[0] === 'collections' && seg[2] === 'products' && seg[3]) return lookup('products', seg[3]);
      if (seg[0] === 'products' && seg[1]) return lookup('products', seg[1]);
      if (seg[0] === 'collections' && seg[1]) return lookup('collections', seg[1]);
      if (seg[0] === 'pages' && seg[1]) return lookup('pages', seg[1]);
      if (seg[0] === 'blogs' && seg[2]) return lookup('articles', seg[2]);
      return null;
    },
    async setSeo(r, v) {
      if (r.kind === 'product' || r.kind === 'collection') {
        const seo = { title: v.title ?? r.seoTitle ?? '', description: v.description ?? r.seoDescription ?? '' };
        const m = r.kind === 'product'
          ? 'mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { field message } } }'
          : 'mutation($p: CollectionUpdateInput!) { collectionUpdate(collection: $p) { userErrors { field message } } }';
        const d = await gql<Record<string, { userErrors: { message: string }[] }>>(m, { p: { id: r.id, seo } });
        userErrors(Object.values(d)[0]?.userErrors);
        return;
      }
      if (v.title !== undefined) await setMeta(r.id, 'title_tag', v.title);
      if (v.description !== undefined) await setMeta(r.id, 'description_tag', v.description);
    },
    async setTitle(r, title) {
      const m: Record<string, string> = {
        product: 'mutation($id: ID!, $t: String!) { r: productUpdate(product: { id: $id, title: $t }) { userErrors { field message } } }',
        collection: 'mutation($id: ID!, $t: String!) { r: collectionUpdate(collection: { id: $id, title: $t }) { userErrors { field message } } }',
        page: 'mutation($id: ID!, $t: String!) { r: pageUpdate(id: $id, page: { title: $t }) { userErrors { field message } } }',
        article: 'mutation($id: ID!, $t: String!) { r: articleUpdate(id: $id, article: { title: $t }) { userErrors { field message } } }',
      };
      if (!m[r.kind]) throw new Error(`Cannot change the title of a ${r.kind}.`);
      const d = await gql<{ r: { userErrors: { message: string }[] } }>(m[r.kind]!, { id: r.id, t: title });
      userErrors(d.r.userErrors);
    },
    async createRedirect(fromPath, toPath) {
      const d = await gql<{ urlRedirectCreate: { urlRedirect: { id: string } | null; userErrors: { message: string }[] } }>(
        'mutation($r: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $r) { urlRedirect { id path target } userErrors { field message } } }',
        { r: { path: fromPath, target: toPath } },
      );
      userErrors(d.urlRedirectCreate.userErrors);
      if (!d.urlRedirectCreate.urlRedirect) throw new Error('Shopify did not create the redirect.');
      return d.urlRedirectCreate.urlRedirect.id;
    },
    async deleteRedirect(id) {
      const d = await gql<{ urlRedirectDelete: { userErrors: { message: string }[] } }>('mutation($id: ID!) { urlRedirectDelete(id: $id) { deletedUrlRedirectId userErrors { field message } } }', { id });
      userErrors(d.urlRedirectDelete.userErrors);
    },
    async createDraft(p) {
      const handle = p.path.replace(/\/+$/, '').split('/').pop() || 'new-page';
      const d = await gql<{ pageCreate: { page: { id: string } | null; userErrors: { message: string }[] } }>(
        'mutation($p: PageCreateInput!) { pageCreate(page: $p) { page { id } userErrors { field message } } }',
        { p: { title: p.title, handle, body: p.html, isPublished: false } },
      );
      userErrors(d.pageCreate.userErrors);
      if (!d.pageCreate.page) throw new Error('Shopify did not create the page.');
      // SEO fields are set afterwards (metafieldsSet is documented as an upsert; pageCreate's metafields are not).
      if (p.seoTitle) await setMeta(d.pageCreate.page.id, 'title_tag', p.seoTitle);
      if (p.description) await setMeta(d.pageCreate.page.id, 'description_tag', p.description);
      return { id: d.pageCreate.page.id, editUrl: `https://${cfg.shop}/admin/pages/${d.pageCreate.page.id.split('/').pop()}` };
    },
    async deleteDraft(id) {
      const d = await gql<{ pageDelete: { userErrors: { message: string }[] } }>('mutation($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { field message } } }', { id });
      userErrors(d.pageDelete.userErrors);
    },
  };
}
