import type { SiteInventory } from '@seo/core';
import { prisma, type Prisma } from './client';
import { siteKey } from '@seo/core';

/** Autopilot phase 1: the WordPress inventory per account and website. Every query names both. */
export async function getSiteInventory(accountId: string, domain: string): Promise<SiteInventory | null> {
  const row = await prisma.siteInventory.findUnique({ where: { accountId_domain: { accountId, domain } } });
  return row ? (row.data as unknown as SiteInventory) : null;
}

export async function saveSiteInventory(inv: SiteInventory): Promise<void> {
  const data = inv as unknown as Prisma.InputJsonValue;
  const refreshedAt = new Date(inv.refreshedAt);
  await prisma.siteInventory.upsert({
    where: { accountId_domain: { accountId: inv.accountId, domain: inv.domain } },
    create: { accountId: inv.accountId, domain: inv.domain, data, refreshedAt },
    update: { data, refreshedAt },
  });
}

export async function deleteSiteInventory(accountId: string, domain: string): Promise<void> {
  await prisma.siteInventory.deleteMany({ where: { accountId, domain } });
}

/**
 * The account a website belongs to: the customer account whose website (or extra website) is on
 * this domain, else "team" (an agency client site).
 */
export async function accountIdForDomain(domain: string): Promise<string> {
  const rows = await prisma.customerAccount.findMany({ select: { id: true, website: true, extraWebsites: true } });
  // Websites are matched by site key, so two folder websites on one host belong to their own accounts.
  const hit = rows.find((r) => [r.website ?? '', ...r.extraWebsites].some((w) => w && siteKey(w) === domain));
  return hit?.id ?? 'team';
}
