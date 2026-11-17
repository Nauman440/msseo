'use server';

import { redirect } from 'next/navigation';
import { newAuditSchema } from '@seo/core';
import { revalidatePath } from 'next/cache';
import { accountSites, domainOf, getAccountByUserId, PLANS, updateAccount } from '@/lib/accounts';
import { websiteOrigin } from '@/lib/signup';
import { ConfigError, startAudit } from '@/lib/audit-runner';
import { hit } from '@/lib/rate-limit';
import { requireCustomer } from '@/lib/session';

export type RunState = { error?: string };

/** Customer audits a day (on top of the weekly automatic one). */
const PER_DAY = 2;

/** Customer: audit one of their websites now (quick, 10 pages, client report). */
export async function runCustomerAuditAction(site: string): Promise<RunState> {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  const url = account ? accountSites(account).find((w) => domainOf(w) === domainOf(site)) : undefined;
  if (!account || !url) return { error: 'Add your website first.' };
  if (account.status === 'cancelled') return { error: 'Your plan is cancelled. Restart it under Account to run audits again.' };
  if (!(await hit(`customer-audit:${user.id}`, PER_DAY, 24 * 60 * 60)).allowed) return { error: `You can run ${PER_DAY} audits a day. Your weekly audit also runs automatically.` };
  let id: string;
  try {
    const input = newAuditSchema.parse({ url, audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, source: 'customer' });
    id = (await startAudit(input, user.id)).id;
  } catch (err) {
    return { error: err instanceof ConfigError ? 'Audits are not available right now.' : 'Could not start the audit. Please try again.' };
  }
  redirect(`/my/reports/${id}`);
}

/** Growth: add another website (up to the plan's limit) and start its first audit. */
export async function addWebsiteAction(_prev: RunState, form: FormData): Promise<RunState> {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) return { error: 'Account not found.' };
  const limit = PLANS[account.plan].websites;
  const sites = accountSites(account);
  if (sites.length >= limit) return { error: account.plan === 'growth' ? `The Growth plan covers up to ${limit} websites.` : 'Your plan covers one website. Ask us about the Growth plan for up to 3.' };
  const website = websiteOrigin(String(form.get('website') ?? ''));
  if (!website) return { error: 'Enter a website address, for example https://yourbusiness.com' };
  if (sites.some((w) => domainOf(w) === domainOf(website))) return { error: 'That website is already on your account.' };
  await updateAccount(user.id, { extraWebsites: [...account.extraWebsites, website] });
  const input = newAuditSchema.parse({ url: website, audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, source: 'customer' });
  await startAudit(input, user.id).catch(() => undefined);
  revalidatePath('/my');
  redirect(`/my?site=${encodeURIComponent(domainOf(website))}`);
}

/** Remove an extra website (the main one stays). Its past audits are kept for the team. */
export async function removeWebsiteAction(site: string): Promise<void> {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/my');
  await updateAccount(user.id, { extraWebsites: account.extraWebsites.filter((w) => domainOf(w) !== domainOf(site)) });
  revalidatePath('/my');
  redirect('/my');
}
