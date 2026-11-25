import { inventoryDue, pluginSupportsSigning } from '@seo/core';
import { refreshWordPressInventory } from '@seo/core/server';
import { listSiteConnections, saveSiteConnection } from './connections';
import { accountIdForDomain, getSiteInventory, saveSiteInventory } from './inventory';

export type InventoryRunResult = { domain: string; accountId: string; items?: number; critical?: string[]; error?: string };

/**
 * Autopilot phase 1, weekly: reads the status and every published page of each connected WordPress
 * site (plugin 1.1.0+) whose inventory is older than a week. One site at a time.
 */
export async function refreshDueInventories(now = new Date(), log: (m: Record<string, unknown>) => void = () => undefined): Promise<InventoryRunResult[]> {
  const out: InventoryRunResult[] = [];
  for (const c of await listSiteConnections()) {
    if (c.platform !== 'wordpress' || c.status !== 'ok' || !pluginSupportsSigning(c.plugin?.version)) continue;
    const accountId = await accountIdForDomain(c.domain);
    if (!inventoryDue(await getSiteInventory(accountId, c.domain), now)) continue;
    try {
      const r = await refreshWordPressInventory(c, { accountId, save: saveSiteConnection, saveInventory: saveSiteInventory, now });
      const critical = r.alerts.filter((a) => a.level === 'critical').map((a) => a.message);
      out.push({ domain: c.domain, accountId, items: r.inventory.items.length, ...(critical.length ? { critical } : {}) });
    } catch (err) {
      out.push({ domain: c.domain, accountId, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
    log(out[out.length - 1]!);
  }
  return out;
}
