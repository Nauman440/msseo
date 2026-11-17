import 'server-only';
import { redirect } from 'next/navigation';
import type { ReportModel } from '@seo/core';
import { accountSites, domainOf, getAccountByUserId, type Account } from './accounts';
import { customerAudits, type CustomerAuditRow } from './customer-data';
import { googleStatus, isConnected, type GoogleStatus } from './customer-google';
import { requireCustomer } from './session';
import { FINISHED, stepPath } from './signup';

/** Everything a customer's site page needs: the account, the chosen site, its audits and Google status. */
export type CustomerSite = {
  user: { id: string; name: string; email: string | null };
  account: Account;
  sites: string[];
  website: string;
  domain: string;
  rows: CustomerAuditRow[];
  latest?: ReportModel;
  previous?: ReportModel;
  latestId: string | null;
  running: boolean;
  google: GoogleStatus;
  connected: boolean;
};

export async function loadCustomerSite(site?: string): Promise<CustomerSite> {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep < FINISHED) redirect(stepPath(account.onboardingStep));
  const sites = accountSites(account);
  const website = sites.find((w) => domainOf(w) === site) ?? sites[0];
  if (!website) redirect('/my/sites');
  const domain = domainOf(website);
  const [audits, google] = await Promise.all([customerAudits(website), googleStatus(user.id, domain)]);
  const latestRow = audits.rows.find((r) => r.status === 'completed');
  return {
    user: { id: user.id, name: user.name, email: user.email },
    account,
    sites,
    website,
    domain,
    ...audits,
    latestId: latestRow?.id ?? null,
    running: audits.rows.some((r) => r.status === 'running'),
    google,
    connected: isConnected(google),
  };
}
