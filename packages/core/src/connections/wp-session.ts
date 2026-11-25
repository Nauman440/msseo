import { decryptSecret, encryptSecret } from '../secrets';
import { createWordPressClient, pluginSupportsSigning, type WordPressClient } from '../providers/wordpress';
import { newSigningKey } from '../providers/wordpress-sign';
import type { HttpLog } from '../providers/http';
import { collectInventory, statusAlerts, type SiteInventory } from './inventory';
import type { SiteConnection, WordPressSecret } from './types';

/**
 * A ready WordPress client for a connection: signed requests when the plugin supports them. The
 * first time a 1.1.0+ plugin is seen, a new signing key is created, given to the plugin (with the
 * Application Password only) and saved, encrypted, on the connection. After that the plugin refuses
 * unsigned requests.
 */
export async function wordpressSession(
  c: SiteConnection,
  deps: { save: (c: SiteConnection) => Promise<void>; log?: HttpLog },
): Promise<{ wp: WordPressClient; connection: SiteConnection }> {
  if (c.platform !== 'wordpress') throw new Error('Not a WordPress connection.');
  const secret = JSON.parse(decryptSecret(c.secret)) as WordPressSecret;
  const make = (signingKey?: string) => createWordPressClient({ siteUrl: c.siteUrl, user: c.account, password: secret.password, signingKey, log: deps.log });
  if (secret.signingKey || !pluginSupportsSigning(c.plugin?.version)) return { wp: make(secret.signingKey), connection: c };
  const key = newSigningKey();
  await make().setKey(key);
  const connection: SiteConnection = { ...c, secret: encryptSecret(JSON.stringify({ ...secret, signingKey: key } satisfies WordPressSecret)) };
  await deps.save(connection);
  return { wp: make(key), connection };
}

/**
 * Reads the site's status and inventory and saves them. Returns the inventory and any findings that
 * must reach a person straight away (e.g. "Discourage search engines" switched on).
 */
export async function refreshWordPressInventory(
  c: SiteConnection,
  deps: {
    accountId: string;
    save: (c: SiteConnection) => Promise<void>;
    saveInventory: (inv: SiteInventory) => Promise<void>;
    now?: Date;
    log?: HttpLog;
  },
): Promise<{ inventory: SiteInventory; alerts: ReturnType<typeof statusAlerts>; connection: SiteConnection }> {
  if (!pluginSupportsSigning(c.plugin?.version)) throw new Error('Update the MS SCORE Connector plugin to version 1.1.0 or later to read the site’s pages.');
  const { wp, connection } = await wordpressSession(c, deps);
  const inventory = await collectInventory(wp, { accountId: deps.accountId, domain: c.domain, now: deps.now });
  await deps.saveInventory(inventory);
  const next: SiteConnection = { ...connection, plugin: { version: inventory.status.version, seo: inventory.status.seo } };
  if (next.plugin?.version !== connection.plugin?.version || next.plugin?.seo !== connection.plugin?.seo) await deps.save(next);
  return { inventory, alerts: statusAlerts(inventory.status), connection: next };
}
