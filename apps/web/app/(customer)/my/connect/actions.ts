'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { listGa4Properties, listGscSites, normDomain } from '@seo/core';
import { accountSites, domainOf, getAccountByUserId } from '@/lib/accounts';
import { forgetSiteGoogleData } from '@/lib/customer-google';
import { requireCustomer } from '@/lib/session';

export type ConnectState = { error?: string };

async function ownSite(raw: string) {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  const domain = normDomain(raw);
  if (!account || !accountSites(account).some((w) => domainOf(w) === domain)) throw new Error('Not your website');
  return { user, domain };
}

/** Saves the Search Console (required) and Analytics 4 (optional) property for one website. */
export async function saveGoogleChoiceAction(rawDomain: string, _prev: ConnectState, form: FormData): Promise<ConnectState> {
  const { user, domain } = await ownSite(rawDomain);
  const db = await import('@seo/db');
  const gscProperty = String(form.get('gscProperty') ?? '');
  const ga4Property = String(form.get('ga4Property') ?? '');
  if (!gscProperty) return { error: 'Choose your Search Console property.' };
  try {
    // Only properties this Google account can really read.
    const token = await db.customerGoogleToken(user.id);
    const [sites, props] = await Promise.all([listGscSites(token), ga4Property ? listGa4Properties(token) : Promise.resolve([])]);
    if (!sites.includes(gscProperty)) return { error: 'That Search Console property is not in this Google account.' };
    const ga4 = ga4Property ? props.find((p) => p.property === ga4Property) : undefined;
    if (ga4Property && !ga4) return { error: 'That Analytics property is not in this Google account.' };
    await db.setCustomerGoogleSite(user.id, domain, { gscProperty, ga4Property: ga4?.property ?? null, ga4Name: ga4 ? `${ga4.accountName} · ${ga4.name}` : null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save. Please try again.' };
  }
  forgetSiteGoogleData(user.id);
  revalidatePath('/my', 'layout');
  redirect(`/my?site=${encodeURIComponent(domain)}`);
}

/** Removes the customer's Google connection (all their websites). */
export async function disconnectGoogleAction(rawDomain: string): Promise<void> {
  const { user, domain } = await ownSite(rawDomain);
  const db = await import('@seo/db');
  await db.deleteCustomerGoogle(user.id);
  forgetSiteGoogleData(user.id);
  revalidatePath('/my', 'layout');
  redirect(`/my/connections?site=${encodeURIComponent(domain)}&disconnected=1`);
}
