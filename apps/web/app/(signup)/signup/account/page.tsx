import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PasswordField } from '@/components/signup/PasswordField';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { StepForm } from '@/components/signup/StepForm';
import { SIGNUP_INPUT, SIGNUP_LABEL } from '@/components/signup/styles';
import { getAccountByUserId, isPlan, PLANS } from '@/lib/accounts';
import { authEnabled, getSessionUser } from '@/lib/session';
import { freeAuditSummary, stepPath } from '@/lib/signup';
import { createAccountAction } from '../actions';

export const metadata: Metadata = { title: 'Create your account' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ plan?: string; audit?: string }> };

/** Step 1 · About you: creates the login and the trial (design 1-about-you.png). */
export default async function AboutYouPage({ searchParams }: Props) {
  const { plan, audit: auditId } = await searchParams;
  if (!isPlan(plan)) redirect(`/signup${auditId ? `?audit=${encodeURIComponent(auditId)}` : ''}`);
  const user = await getSessionUser();
  if (user?.id && user.role === 'customer') {
    const account = await getAccountByUserId(user.id);
    if (account) redirect(stepPath(account.onboardingStep));
  }
  if (user?.id && user.role !== 'customer') redirect('/dashboard');
  const audit = await freeAuditSummary(auditId);

  return (
    <SignupShell step={1} plan={plan} audit={audit} signedIn={false}>
      <StepHeading step={1} title="Let's get you more customers" intro={`Create your account to start the ${PLANS[plan].name} plan. It takes about 2 minutes.`} />
      {!authEnabled() && <p className="mb-6 rounded-tile bg-primary-soft px-4 py-3 text-sm text-primary-text">Sign-up needs login to be switched on (AUTH_SECRET) on this server.</p>}
      <StepForm
        action={createAccountAction}
        submit="Create my account"
        footer={
          <div className="flex flex-col gap-3 text-sm text-ink-2">
            <p>
              Already have an account?{' '}
              <Link href="/login?next=/my" className="font-semibold text-primary-text underline">
                Log in
              </Link>
            </p>
            <p className="text-[13px] text-ink-3">
              By creating an account you agree to our{' '}
              <Link href="/terms" className="underline">
                terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
          </div>
        }
      >
        <input type="hidden" name="plan" value={plan} />
        {audit && <input type="hidden" name="audit" value={audit.id} />}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={SIGNUP_LABEL}>Your name</span>
            <input name="name" autoComplete="name" required className={SIGNUP_INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={SIGNUP_LABEL}>Business name</span>
            <input name="businessName" autoComplete="organization" required className={SIGNUP_INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={SIGNUP_LABEL}>Email</span>
            <input name="email" type="email" autoComplete="email" required className={SIGNUP_INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={SIGNUP_LABEL}>Phone</span>
            <input name="phone" type="tel" autoComplete="tel" className={SIGNUP_INPUT} />
          </label>
        </div>
        <PasswordField />
      </StepForm>
    </SignupShell>
  );
}
