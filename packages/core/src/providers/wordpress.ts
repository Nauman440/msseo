import { z } from 'zod';
import type { SiteAdapter, SiteResource } from '../connections/types';
import { HttpError, request, requestJson, type HttpLog } from './http';
import { wpSignedHeaders } from './wordpress-sign';

/**
 * WordPress client (spec §16.5). Auth: an Application Password (WordPress core since 5.6) sent as
 * HTTP Basic over HTTPS. Connecting uses WordPress's own approval screen
 * (`authorize-application.php`, whose address comes from the REST index). SEO fields, page lookup by
 * address and redirects go through our MS SCORE Connector plugin (`/wp-json/msscore/v1/`), because
 * the SEO plugins' fields are not in the core REST API; draft pages use core `wp/v2/pages`.
 */
export const WP_APP_NAME = 'MS SCORE';
/** Fixed UUID for this app (WordPress uses it to group passwords per app). */
export const WP_APP_ID = '6f6d5a52-0b1c-4b7e-9f0e-6d73636f7265';

const index = z.object({
  url: z.string().optional(),
  authentication: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
}).passthrough();
const appPasswords = z.object({ endpoints: z.object({ authorization: z.string().url() }) }).passthrough();

/** The site's Application Passwords approval address, or a plain-words reason it cannot connect. */
export async function wordpressAuthorizeUrl(siteUrl: string, log?: HttpLog): Promise<{ url: string } | { error: string }> {
  const root = siteUrl.replace(/\/+$/, '');
  if (!/^https:\/\//.test(root)) return { error: 'The site must use https:// to connect.' };
  let data: z.infer<typeof index>;
  try {
    data = index.parse(await requestJson(`${root}/wp-json/`, { provider: 'wordpress', timeoutMs: 15_000, retries: 1, log }));
  } catch {
    return { error: 'This does not look like a WordPress site, or its REST API is switched off.' };
  }
  const auth = data.authentication && !Array.isArray(data.authentication) ? data.authentication['application-passwords'] : undefined;
  const parsed = appPasswords.safeParse(auth);
  if (!parsed.success) return { error: 'Application Passwords are turned off on this site (a security plugin may block them).' };
  return { url: parsed.data.endpoints.authorization };
}

const me = z.object({ id: z.number(), name: z.string().optional(), capabilities: z.record(z.string(), z.boolean()).optional(), roles: z.array(z.string()).optional() }).passthrough();
const status = z.object({ version: z.string(), seo: z.string() }).passthrough();

/** GET /status from plugin 1.1.0+ (older plugins send only version and seo). */
export const wpStatusSchema = z.object({
  version: z.string(),
  seo: z.string(),
  seo_plugin: z.enum(['yoast', 'rank-math', 'aioseo', 'seopress', 'none']),
  wp_version: z.string(),
  php_version: z.string(),
  theme: z.object({ name: z.string(), version: z.string(), template: z.string(), title_tag: z.boolean() }),
  page_builder: z.enum(['gutenberg', 'classic', 'elementor', 'divi', 'bricks', 'other']),
  page_builders: z.array(z.string()),
  cache_plugins: z.array(z.string()),
  woocommerce: z.boolean(),
  sitemap: z.object({ url: z.string().nullable(), by: z.string() }),
  robots_file: z.boolean(),
  llms_file: z.boolean(),
  search_visible: z.boolean(),
  home_url: z.string(),
  signed: z.boolean(),
  inventory_types: z.array(z.string()),
}).passthrough();
export type WpStatus = z.infer<typeof wpStatusSchema>;

const inventoryItem = z.object({
  id: z.number(),
  url: z.string().nullable(),
  type: z.string(),
  name: z.string(),
  title_tag: z.string().nullable(),
  seo_title: z.string().nullable(),
  meta_description: z.string().nullable(),
  canonical: z.string().nullable(),
  robots: z.object({ noindex: z.boolean(), nofollow: z.boolean() }),
  h1s: z.array(z.string()),
  images: z.array(z.object({ id: z.number().nullable(), url: z.string(), alt: z.string().nullable(), featured: z.boolean() })),
  word_count: z.number(),
  schema_types: z.array(z.string()),
  builder: z.string().nullable(),
  is_front_page: z.boolean(),
  modified: z.string().nullable(),
  count: z.number().optional(),
}).passthrough();
export type WpInventoryItem = z.infer<typeof inventoryItem>;
const inventoryPage = z.object({ type: z.string(), page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number(), items: z.array(inventoryItem) }).passthrough();
export type WpInventoryPage = z.infer<typeof inventoryPage>;

/** Change types plugin 1.2.0 can make (spec phase 2). */
export const WP_CHANGE_TYPES = [
  'meta_title', 'meta_description', 'canonical', 'robots_noindex', 'og_tags', 'image_alt', 'heading_fix',
  'content_block', 'internal_link', 'schema', 'redirect_301', 'sitemap', 'robots_txt', 'llms_txt',
] as const;
export type WpChangeType = (typeof WP_CHANGE_TYPES)[number];
/** What a change is aimed at: a post/page/product, a category, an image, or the whole site. */
export type WpTarget = { post_id: number } | { term_id: number; taxonomy: string } | { attachment_id: number } | { site: true };
export type WpChange = { change_id: string; type: WpChangeType; target: WpTarget; new_value: unknown };
const applyResult = z.object({
  status: z.enum(['applied', 'needs_human', 'skipped', 'failed', 'rolled_back']),
  change_id: z.string().optional(),
  url: z.string().optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().nullable().optional(),
  repeat: z.boolean().optional(),
  purged: z.array(z.string()).optional(),
}).passthrough();
export type WpApplyResult = z.infer<typeof applyResult>;
const rollbackResult = z.object({ status: z.enum(['rolled_back', 'needs_human', 'skipped', 'failed', 'applied']), change_id: z.string().optional(), reason: z.string().nullable().optional(), repeat: z.boolean().optional() }).passthrough();
export type WpRollbackResult = z.infer<typeof rollbackResult>;

/** Whether a plugin version can apply and undo changes itself (1.2.0 and later). */
export function pluginSupportsApply(version: string | null | undefined): boolean {
  const [a = 0, b = 0] = (version ?? '0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  return a > 1 || (a === 1 && b >= 2);
}

/** Whether a plugin version can sign requests and send its inventory (1.1.0 and later). */
export function pluginSupportsSigning(version: string | null | undefined): boolean {
  const [a = 0, b = 0] = (version ?? '0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  return a > 1 || (a === 1 && b >= 1);
}
const resource = z.object({ id: z.union([z.number(), z.string()]), type: z.string(), title: z.string(), seo_title: z.string().nullable(), seo_description: z.string().nullable(), edit_url: z.string().nullable() }).passthrough();

/** The Connector plugin refuses our requests because it was given a different signing key. */
export class WordPressKeyMismatch extends Error {
  constructor() {
    super('The MS SCORE Connector plugin was set up by an earlier connection. In WordPress, deactivate and then activate MS SCORE Connector (Plugins page), then check the connection again.');
    this.name = 'WordPressKeyMismatch';
  }
}

export type WordPressClient = SiteAdapter & {
  me(): Promise<{ canEdit: boolean; name: string | null }>;
  plugin(): Promise<{ version: string; seo: string } | null>;
  /** Full site status (plugin 1.1.0+). */
  status(): Promise<WpStatus>;
  /** Gives the plugin its signing key (the first time unsigned, later signed with the current key). */
  setKey(key: string): Promise<void>;
  /** Makes the plugin forget the signing key (signed; used when the site is disconnected). */
  clearKey(): Promise<void>;
  /** One page of the inventory for one content type (signed). */
  inventory(type: string, page: number, perPage?: number): Promise<WpInventoryPage>;
  /** Makes one change (plugin 1.2.0+). Idempotent by change_id. */
  apply(change: WpChange): Promise<WpApplyResult>;
  /** Undoes one change by its change_id. */
  rollback(changeId: string, reason?: string): Promise<WpRollbackResult>;
};

/**
 * `signingKey`: the key MS SCORE gave the plugin. With it, every call to the plugin (`msscore/v1/…`)
 * is signed; WordPress core routes (`wp/v2/…`) keep using the Application Password only.
 */
export function createWordPressClient(cfg: { siteUrl: string; user: string; password: string; signingKey?: string | null; log?: HttpLog }): WordPressClient {
  const root = cfg.siteUrl.replace(/\/+$/, '');
  const auth = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`;
  const sign = async (method: string, path: string, body: string): Promise<Record<string, string>> =>
    cfg.signingKey && path.startsWith('msscore/') ? wpSignedHeaders(cfg.signingKey, method, path, body) : {};
  const call = async <T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, schema?: z.ZodType<T>) => {
    // The body is encoded once, so the signature covers exactly the bytes that are sent.
    const raw = body === undefined ? '' : JSON.stringify(body);
    const headers = { authorization: auth, ...(raw ? { 'content-type': 'application/json' } : {}), ...(await sign(method, path, raw)) };
    const d = await requestJson<unknown>(`${root}/wp-json/${path}`, { provider: 'wordpress', method, ...(raw ? { rawBody: raw } : {}), headers, timeoutMs: 20_000, retries: method === 'GET' ? 2 : 0, log: cfg.log });
    return schema ? schema.parse(d) : (d as T);
  };
  const del = async (path: string) => {
    // The shared helper only sends GET/POST; WordPress accepts X-HTTP-Method-Override for DELETE.
    const headers = { authorization: auth, 'x-http-method-override': 'DELETE', ...(await sign('DELETE', path, '')) };
    const res = await request(`${root}/wp-json/${path}`, { provider: 'wordpress', method: 'POST', headers, timeoutMs: 20_000, retries: 0, log: cfg.log });
    if (!res.ok && res.status !== 404) throw new HttpError(`wordpress ${res.status}`, res.status, (await res.text()).slice(0, 300));
  };
  const asResource = (r: z.infer<typeof resource>): SiteResource => ({ id: String(r.id), kind: r.type, title: r.title, seoTitle: r.seo_title, seoDescription: r.seo_description, editUrl: r.edit_url });
  const pluginError = (err: unknown) => (err instanceof HttpError && err.status === 404 ? new Error('The MS SCORE Connector plugin is not installed or not active on this site.') : err);

  return {
    platform: 'wordpress',
    async me() {
      const u = await call('wp/v2/users/me?context=edit', 'GET', undefined, me);
      const caps = u.capabilities ?? {};
      return { canEdit: Boolean(caps.edit_others_pages || caps.edit_pages || u.roles?.some((r) => r === 'administrator' || r === 'editor')), name: u.name ?? null };
    },
    async plugin() {
      try {
        const s = await call('msscore/v1/status', 'GET', undefined, status);
        return { version: s.version, seo: s.seo };
      } catch (err) {
        // The plugin is there but holds a signing key MS SCORE does not have (e.g. set by an earlier connection).
        if (err instanceof HttpError && err.status === 401 && /msscore_(bad_signature|no_key)/.test(err.body ?? '')) throw new WordPressKeyMismatch();
        return null;
      }
    },
    async status() {
      return call('msscore/v1/status', 'GET', undefined, wpStatusSchema).catch((e) => Promise.reject(pluginError(e)));
    },
    async setKey(key) {
      await call('msscore/v1/key', 'POST', { key }).catch((e) => Promise.reject(pluginError(e)));
    },
    async clearKey() {
      await del('msscore/v1/key/clear');
    },
    async apply(change) {
      // The plugin answers needs_human / skipped with 200 and refusals with 4xx; both carry a status.
      try {
        return await call('msscore/v1/apply', 'POST', change, applyResult);
      } catch (err) {
        if (err instanceof HttpError && err.status !== 401 && err.body) {
          let body: unknown = null;
          try {
            body = JSON.parse(err.body);
          } catch {
            body = null;
          }
          const parsed = applyResult.safeParse(body);
          if (parsed.success) return parsed.data;
        }
        throw pluginError(err);
      }
    },
    async rollback(changeId, reason) {
      try {
        return await call('msscore/v1/rollback', 'POST', { change_id: changeId, ...(reason ? { reason } : {}) }, rollbackResult);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return { status: 'failed', change_id: changeId, reason: 'The site has no record of this change.' };
        throw pluginError(err);
      }
    },
    async inventory(type, page, perPage = 50) {
      const q = `type=${encodeURIComponent(type)}&page=${page}&per_page=${perPage}`;
      return call(`msscore/v1/inventory?${q}`, 'GET', undefined, inventoryPage).catch((e) => Promise.reject(pluginError(e)));
    },
    async find(url) {
      try {
        const r = await call(`msscore/v1/resolve?url=${encodeURIComponent(url)}`, 'GET', undefined, resource.nullable());
        return r ? asResource(r) : null;
      } catch (err) {
        if (err instanceof HttpError && err.status === 404 && /not_found/.test(err.body ?? '')) return null;
        throw pluginError(err);
      }
    },
    async setSeo(r, v) {
      await call('msscore/v1/seo', 'POST', { id: Number(r.id), ...(v.title !== undefined ? { title: v.title } : {}), ...(v.description !== undefined ? { description: v.description } : {}) }).catch((e) => Promise.reject(pluginError(e)));
    },
    async setTitle(r, title) {
      await call('msscore/v1/title', 'POST', { id: Number(r.id), title }).catch((e) => Promise.reject(pluginError(e)));
    },
    async createRedirect(fromPath, toPath) {
      const r = await call('msscore/v1/redirects', 'POST', { from: fromPath, to: toPath }, z.object({ id: z.string() }).passthrough()).catch((e) => Promise.reject(pluginError(e)));
      return r.id;
    },
    async deleteRedirect(id) {
      await del(`msscore/v1/redirects/${encodeURIComponent(id)}`);
    },
    async createDraft(p) {
      const slug = p.path.replace(/\/+$/, '').split('/').pop() || 'new-page';
      const page = await call('wp/v2/pages', 'POST', { title: p.title, content: p.html, status: 'draft', slug }, z.object({ id: z.number(), link: z.string().optional() }).passthrough());
      await call('msscore/v1/seo', 'POST', { id: page.id, title: p.seoTitle, description: p.description }).catch(() => undefined);
      return { id: String(page.id), editUrl: `${root}/wp-admin/post.php?post=${page.id}&action=edit` };
    },
    async deleteDraft(id) {
      // Moves the draft to the bin (not deleted for good).
      await del(`wp/v2/pages/${encodeURIComponent(id)}`);
    },
  };
}
