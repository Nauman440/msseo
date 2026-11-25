import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inventoryDue, normDomain, pluginSupportsSigning, type SiteInventory } from '@seo/core';
import { refreshWordPressInventory } from '@seo/core/server';
import { accountSites, domainOf, listAccounts } from './accounts';
import { usingDatabase } from './audit-store';
import { prepare } from './auto';
import { getConnection, saveConnection } from './connections';

/**
 * Autopilot phase 1: the connected WordPress site's inventory, per account and website. Postgres
 * (SiteInventory) when DATABASE_URL is set, else a JSON file in DATA_DIR/inventory.
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'inventory');
const safe = (s: string) => s.replace(/[^a-z0-9.-]/gi, '');
const file = (accountId: string, domain: string) => resolve(DIR, `${safe(accountId)}__${safe(domain)}.json`);

/** The customer account that owns the website, else "team" (an agency client site). */
export async function accountIdFor(rawDomain: string): Promise<string> {
  const domain = normDomain(rawDomain);
  const hit = (await listAccounts()).find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  return hit?.id ?? 'team';
}

export async function getInventory(accountId: string, rawDomain: string): Promise<SiteInventory | null> {
  const domain = normDomain(rawDomain);
  if (usingDatabase()) {
    const { getSiteInventory } = await import('@seo/db');
    return getSiteInventory(accountId, domain).catch(() => null);
  }
  try {
    const inv = JSON.parse(await readFile(file(accountId, domain), 'utf8')) as SiteInventory;
    return inv.accountId === accountId && inv.domain === domain ? inv : null;
  } catch {
    return null;
  }
}

export async function saveInventory(inv: SiteInventory): Promise<void> {
  if (usingDatabase()) {
    const { saveSiteInventory } = await import('@seo/db');
    await saveSiteInventory(inv);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const target = file(inv.accountId, inv.domain);
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(inv));
  await rename(tmp, target);
}

/** Reads the site's status and inventory now (the "Read the site again" button and the background refresh). */
export async function refreshInventory(rawDomain: string): Promise<{ inventory: SiteInventory; alerts: { level: 'critical' | 'warning'; message: string }[] }> {
  const domain = normDomain(rawDomain);
  const c = await getConnection(domain);
  if (!c || c.platform !== 'wordpress') throw new Error('No WordPress site is connected.');
  const accountId = await accountIdFor(domain);
  const r = await refreshWordPressInventory(c, { accountId, save: saveConnection, saveInventory });
  return { inventory: r.inventory, alerts: r.alerts };
}

/**
 * The saved inventory, and a background refresh when it is missing or older than a week (only for
 * WordPress sites whose plugin can send it). `refreshing` is true while that runs.
 */
export async function inventoryFor(rawDomain: string): Promise<{ inventory: SiteInventory | null; refreshing: boolean; accountId: string }> {
  const domain = normDomain(rawDomain);
  const [c, accountId] = await Promise.all([getConnection(domain), accountIdFor(domain)]);
  const inventory = await getInventory(accountId, domain);
  if (!c || c.platform !== 'wordpress' || c.status !== 'ok' || !pluginSupportsSigning(c.plugin?.version) || !inventoryDue(inventory)) {
    return { inventory, refreshing: false, accountId };
  }
  return { inventory, refreshing: prepare(`wp-inventory:${domain}`, () => refreshInventory(domain), 6 * 60 * 60_000), accountId };
}
