import { z } from 'zod';
import type { SiteAdapter, SiteResource } from '../connections/types';
import { HttpError, request, requestJson, type HttpLog } from './http';

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
const resource = z.object({ id: z.union([z.number(), z.string()]), type: z.string(), title: z.string(), seo_title: z.string().nullable(), seo_description: z.string().nullable(), edit_url: z.string().nullable() }).passthrough();

export type WordPressClient = SiteAdapter & {
  me(): Promise<{ canEdit: boolean; name: string | null }>;
  plugin(): Promise<{ version: string; seo: string } | null>;
};

export function createWordPressClient(cfg: { siteUrl: string; user: string; password: string; log?: HttpLog }): WordPressClient {
  const root = cfg.siteUrl.replace(/\/+$/, '');
  const auth = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`;
  const call = <T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, schema?: z.ZodType<T>) =>
    requestJson<unknown>(`${root}/wp-json/${path}`, { provider: 'wordpress', method, body, headers: { authorization: auth }, timeoutMs: 20_000, retries: method === 'GET' ? 2 : 0, log: cfg.log }).then((d) => (schema ? schema.parse(d) : (d as T)));
  const del = async (path: string) => {
    // The shared helper only sends GET/POST; WordPress accepts X-HTTP-Method-Override for DELETE.
    const res = await request(`${root}/wp-json/${path}`, { provider: 'wordpress', method: 'POST', headers: { authorization: auth, 'x-http-method-override': 'DELETE' }, timeoutMs: 20_000, retries: 0, log: cfg.log });
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
      } catch {
        return null;
      }
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
