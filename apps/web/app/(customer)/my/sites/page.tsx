import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { removeWebsiteAction } from '../actions';
import { AddWebsiteForm } from '@/components/customer/AddWebsiteForm';
import { ChangeAddressForm } from '@/components/customer/ChangeAddressForm';
import { accountSites, domainOf, getAccountByUserId, PLANS } from '@/lib/accounts';
import { customerAudits } from '@/lib/customer-data';
import { requireCustomer } from '@/lib/session';
import { FINISHED, stepPath } from '@/lib/signup';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Your sites' };
export const dynamic = 'force-dynamic';

const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');

/** All of the customer's websites (the Growth plan covers up to 3): open, add, remove. */
export default async function SitesPage() {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep < FINISHED) redirect(stepPath(account.onboardingStep));
  const sites = accountSites(account);
  const limit = PLANS[account.plan].websites;
  const scores = await Promise.all(sites.map(async (w) => (await customerAudits(w)).rows.find((r) => r.status === 'completed')?.score ?? null));

  return (
    <>
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">Your sites</h1>
        <p className="mt-1 text-[15px] text-ink-2">
          {sites.length} of {limit} {limit === 1 ? 'website' : 'websites'} on your {PLANS[account.plan].name} plan.
        </p>
      </div>
      <nav aria-label="Your websites">
        <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
          {sites.map((w, i) => {
            const d = domainOf(w);
            const score = scores[i];
            return (
              <li key={d} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-night font-display text-lg font-extrabold text-primary-tint">{d.charAt(0).toUpperCase()}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/my?site=${encodeURIComponent(d)}`} className="break-all text-[17px] font-semibold hover:text-primary-text hover:underline">
                    {d}
                  </Link>
                  {new URL(w).pathname !== '/' && <span className="break-all text-[13px] text-ink-2">Starts at {new URL(w).pathname}</span>}
                </span>
                {score !== null && score !== undefined ? <span className={cn('rounded-pill px-2.5 py-1 text-sm font-bold tabular', scoreTone(score))}>{score}</span> : <span className="text-[13px] text-ink-3">No score yet</span>}
                {w !== account.website && (
                  <form action={removeWebsiteAction.bind(null, d)}>
                    <button type="submit" aria-label={`Remove ${d}`} className="min-h-10 rounded-control px-3 text-sm font-semibold text-ink-3 hover:text-fail-text">
                      Remove
                    </button>
                  </form>
                )}
                <ChangeAddressForm site={d} address={w} />
              </li>
            );
          })}
        </ul>
      </nav>
      {sites.length < limit ? (
        <section id="add" className="scroll-mt-6 rounded-[18px] border border-border bg-surface p-6">
          <AddWebsiteForm left={limit - sites.length} />
        </section>
      ) : (
        limit === 1 && (
          <p className="text-sm text-ink-2">
            Your plan covers one website. The Growth plan covers up to 3: change it in{' '}
            <Link href="/my/account#plan" className="font-semibold text-primary-heading underline">
              your account
            </Link>
            .
          </p>
        )
      )}
    </>
  );
}
