import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { needsApproval } from '@seo/core';
import { currentPlanMonth, monthOf } from '@/components/actions/PlanMonths';
import { ApproveButton } from '@/components/actions/forms';
import { accountSites, domainOf, getAccountByUserId } from '@/lib/accounts';
import { getActions } from '@/lib/actions';
import { requireCustomer } from '@/lib/session';
import { FINISHED, stepPath } from '@/lib/signup';
import { siteLabel } from '@seo/core';

export const metadata: Metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

/** Module 12.4 for customers: actions on any of their websites that wait for their yes. */
export default async function ApprovalsPage() {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep < FINISHED) redirect(stepPath(account.onboardingStep));
  const plans = await Promise.all(accountSites(account).map((w) => getActions(domainOf(w))));
  // Only this month's work can be approved (other months are locked on the Changes tab).
  const waiting = plans.flatMap((ws) => ws.actions.filter((a) => needsApproval(a, 'client') && monthOf(a) === currentPlanMonth(ws)).map((a) => ({ domain: ws.domain, a })));
  return (
    <>
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">Approvals</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-2">Changes that need your yes before we make them, such as new pages or merging pages (old addresses are redirected).</p>
      </div>
      {waiting.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
          {waiting.map(({ domain, a }) => (
            <li key={a.id} className="flex flex-col gap-2 px-5 py-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3">{siteLabel(domain)}</p>
              <p className="font-semibold">{a.title}</p>
              <p className="text-sm text-ink-2">{a.detail}</p>
              <ApproveButton domain={domain} id={a.id} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="flex flex-col items-start gap-2 rounded-[18px] border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-bold">Nothing to approve</h2>
          <p className="text-sm text-ink-2">When a change needs your yes, it shows up here.</p>
          <Link href="/my/actions" className="text-sm font-semibold text-primary-text underline">See your action plan</Link>
        </section>
      )}
    </>
  );
}
