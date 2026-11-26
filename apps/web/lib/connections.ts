import 'server-only';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWordPressClient, normDomain, pluginSupportsSigning, type ShopifySecret, type SiteAdapter, type SiteConnection, type WordPressSecret } from '@seo/core';
import { createShopifyClient, decryptSecret, encryptionKeyValid, encryptSecret, refreshShopifyToken, shopifyTokenStale, wordpressSession, type ShopifyApp } from '@seo/core/server';
import { usingDatabase } from './audit-store';

/**
 * Site connections (spec §16.5): Postgres when DATABASE_URL is set, a JSON file per site in
 * DATA_DIR/connections otherwise. Credentials are always encrypted (ENCRYPTION_KEY).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'connections');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);

/** Connecting needs ENCRYPTION_KEY; Shopify also needs the app's client id and secret. */
export const connectionsReady = () => encryptionKeyValid();
/** The Shopify app's keys (Dev Dashboard → MS SCORE), read at request time from the web app's environment. */
export function shopifyApp(): ShopifyApp | null {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function getConnection(rawDomain: string): Promise<SiteConnection | null> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getSiteConnection } = await import('@seo/db');
    return getSiteConnection(domain).catch(() => null);
  }
  try {
    return JSON.parse(await readFile(file(domain), 'utf8')) as SiteConnection;
  } catch {
    return null;
  }
}

/** Every connected website (the scheduler's list). */
export async function listConnections(): Promise<SiteConnection[]> {
  if (usingDatabase()) {
    const { listSiteConnections } = await import('@seo/db');
    return listSiteConnections().catch(() => []);
  }
  const names = await readdir(DIR).catch(() => [] as string[]);
  const out: SiteConnection[] = [];
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    try {
      out.push(JSON.parse(await readFile(resolve(DIR, n), 'utf8')) as SiteConnection);
    } catch {
      // A file being written or a broken file is skipped.
    }
  }
  return out;
}

export async function saveConnection(c: SiteConnection): Promise<void> {
  if (usingDatabase()) {
    const { saveSiteConnection } = await import('@seo/db');
    await saveSiteConnection(c);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(c.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(c));
  await rename(tmp, file(c.domain));
}

export async function deleteConnection(rawDomain: string): Promise<void> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { deleteSiteConnection } = await import('@seo/db');
    await deleteSiteConnection(domain);
    return;
  }
  await rm(file(domain), { force: true });
}

/** What the screens may show (never the credentials). */
export type ConnectionView = Omit<SiteConnection, 'secret'>;
export const viewOf = (c: SiteConnection | null): ConnectionView | null => {
  if (!c) return null;
  return Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'secret')) as ConnectionView;
};

/** The connected site's host must be the audited website (with or without www). */
export function sameSite(host: string, domain: string): boolean {
  return normDomain(host) === normDomain(domain);
}

// One Shopify token refresh at a time per store (each refresh retires the previous refresh token).
const refreshing = new Map<string, Promise<string>>();

async function shopifyToken(domain: string): Promise<string> {
  const c = await getConnection(domain);
  if (!c || c.platform !== 'shopify') throw new Error('Shopify is not connected.');
  const s = JSON.parse(decryptSecret(c.secret)) as ShopifySecret;
  if (!shopifyTokenStale(s)) return s.accessToken;
  const app = shopifyApp();
  if (!app || !s.refreshToken) throw new Error('The Shopify connection has expired. Connect the store again.');
  const running = refreshing.get(domain);
  if (running) return running;
  const job = (async () => {
    try {
      const next = await refreshShopifyToken(app, c.account, s.refreshToken!);
      await saveConnection({ ...c, secret: encryptSecret(JSON.stringify(next)), checkedAt: new Date().toISOString() });
      return next.accessToken;
    } catch {
      await saveConnection({ ...c, status: 'error', error: 'The Shopify connection has expired. Connect the store again.', checkedAt: new Date().toISOString() });
      throw new Error('The Shopify connection has expired. Connect the store again.');
    } finally {
      refreshing.delete(domain);
    }
  })();
  refreshing.set(domain, job);
  return job;
}

/** The platform client for a connected site. */
export function adapterFor(c: SiteConnection): SiteAdapter & { kind: 'wordpress' | 'shopify' } {
  if (c.platform === 'wordpress') {
    const s = JSON.parse(decryptSecret(c.secret)) as WordPressSecret;
    return Object.assign(createWordPressClient({ siteUrl: c.siteUrl, user: c.account, password: s.password, signingKey: s.signingKey }), { kind: 'wordpress' as const });
  }
  return Object.assign(createShopifyClient({ shop: c.account, token: () => shopifyToken(c.domain) }), { kind: 'shopify' as const });
}

/** Checks the connection still works (and, for WordPress, whether the plugin is installed). */
export async function checkConnection(c: SiteConnection): Promise<SiteConnection> {
  const now = new Date().toISOString();
  try {
    if (c.platform === 'wordpress') {
      const s = JSON.parse(decryptSecret(c.secret)) as WordPressSecret;
      const wp = createWordPressClient({ siteUrl: c.siteUrl, user: c.account, password: s.password, signingKey: s.signingKey });
      const me = await wp.me();
      if (!me.canEdit) throw new Error('This WordPress user cannot edit pages. Connect with an editor or administrator.');
      const next = { ...c, plugin: await wp.plugin(), status: 'ok' as const, error: null, checkedAt: now };
      await saveConnection(next);
      // Plugin 1.1.0+: hand it a signing key the first time; from then on every request is signed.
      if (pluginSupportsSigning(next.plugin?.version)) return (await wordpressSession(next, { save: saveConnection })).connection;
      return next;
    }
    const shop = await createShopifyClient({ shop: c.account, token: () => shopifyToken(c.domain) }).shop();
    if (!sameSite(shop.primaryHost, c.domain)) throw new Error(`This store’s main domain is ${shop.primaryHost}, not ${c.domain}.`);
    const next = { ...c, status: 'ok' as const, error: null, checkedAt: now };
    await saveConnection(next);
    return next;
  } catch (err) {
    const next = { ...c, status: 'error' as const, error: err instanceof Error ? err.message.slice(0, 200) : 'The site did not answer.', checkedAt: now };
    await saveConnection(next);
    return next;
  }
}

/** Asks the WordPress plugin to forget MS SCORE's signing key (before disconnecting). */
export async function clearSigningKey(c: SiteConnection): Promise<void> {
  if (c.platform !== 'wordpress') return;
  const s = JSON.parse(decryptSecret(c.secret)) as WordPressSecret;
  if (!s.signingKey) return;
  await createWordPressClient({ siteUrl: c.siteUrl, user: c.account, password: s.password, signingKey: s.signingKey }).clearKey();
}
