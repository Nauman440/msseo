import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { getAccountByUserId, isPlan, PLANS, TRIAL_DAYS } from '@/lib/accounts';
import { getSessionUser } from '@/lib/session';
import { CONTACT_HREF } from '@/lib/site';
import { freeAuditSummary, stepPath } from '@/lib/signup';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Start your free trial' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ plan?: string; audit?: string }> };

const FEATURES = {
  autopilot: ['Weekly automatic site audit', 'Fixes to titles, descriptions, alt text and links after your approval', 'WordPress and Shopify connection', 'Monthly progress report'],
  growth: ['Everything in Autopilot, for up to 3 websites', 'Keyword and competitor tracking', 'Local SEO and review monitoring', 'AI search visibility tracking', 'Monthly strategy call'],
} as const;

/** Choose a plan (step 8). With ?plan= it goes straight to step 1. */
export default async function ChoosePlanPage({ searchParams }: Props) {
  const { plan, audit: auditId } = await searchParams;
  const user = await getSessionUser();
  if (user?.id && user.role === 'customer') {
    const account = await getAccountByUserId(user.id);
    if (account) redirect(stepPath(account.onboardingStep));
  }
  const auditQuery = auditId ? `&audit=${encodeURIComponent(auditId)}` : '';
  if (isPlan(plan)) redirect(`/signup/account?plan=${plan}${auditQuery}`);
  const audit = await freeAuditSummary(auditId);

  return (
    <SignupShell step={0} plan={null} audit={audit} signedIn={Boolean(user?.id && user.role === 'customer')}>
      <StepHeading title="Choose your plan" intro={`Start with a ${TRIAL_DAYS}-day free trial. Nothing to pay today: you confirm payment before your plan starts.`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
          const p = PLANS[id];
          return (
            <section key={id} className={cn('flex flex-col gap-4 rounded-card bg-surface p-6', id === 'growth' ? 'border-2 border-primary' : 'border border-border')}>
              {id === 'growth' && <span className="self-start rounded-pill bg-primary px-2.5 py-0.5 text-xs font-extrabold text-primary-ink">Most popular</span>}
              <h2 className="text-xl font-extrabold">{p.name}</h2>
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-[34px] font-extrabold tracking-[-0.02em] tabular">{p.price}</span>
                <span className="text-sm text-ink-2">{p.unit}</span>
              </p>
              <ul className="flex flex-col gap-2 text-sm text-ink-2">
                {FEATURES[id].map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-primary-text">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={`/signup/account?plan=${id}${auditQuery}`} className="mt-auto inline-flex min-h-12 items-center justify-center rounded-button bg-primary px-5 text-base font-extrabold text-primary-ink hover:bg-primary-hover">
                Start {TRIAL_DAYS}-day free trial
              </Link>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-ink-2">
        Want a team to handle SEO for you? <a href={CONTACT_HREF} className="font-semibold text-primary-text underline">Book a strategy call</a> for the Full SEO package.
      </p>
    </SignupShell>
  );
}
