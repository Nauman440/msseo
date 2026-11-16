'use server';

import { redirect } from 'next/navigation';
import { newAuditSchema } from '@seo/core';
import { getAccountByUserId } from '@/lib/accounts';
import { ConfigError, startAudit } from '@/lib/audit-runner';
import { hit } from '@/lib/rate-limit';
import { requireCustomer } from '@/lib/session';

export type RunState = { error?: string };

/** Customer audits a day (on top of the weekly automatic one). */
const PER_DAY = 2;

/** Customer: audit their own website now (quick, 10 pages, client report). */
export async function runCustomerAuditAction(): Promise<RunState> {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account?.website) return { error: 'Add your website first.' };
  if (account.status === 'cancelled') return { error: 'Your plan has ended. Contact us to start again.' };
  if (!(await hit(`customer-audit:${user.id}`, PER_DAY, 24 * 60 * 60)).allowed) return { error: `You can run ${PER_DAY} audits a day. Your weekly audit also runs automatically.` };
  let id: string;
  try {
    const input = newAuditSchema.parse({ url: account.website, audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, source: 'customer' });
    id = (await startAudit(input, user.id)).id;
  } catch (err) {
    return { error: err instanceof ConfigError ? 'Audits are not available right now.' : 'Could not start the audit. Please try again.' };
  }
  redirect(`/my/reports/${id}`);
}
