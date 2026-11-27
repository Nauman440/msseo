import type { Metadata } from 'next';
import { Icon } from '@/components/landing/icons';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { StepForm } from '@/components/signup/StepForm';
import { PLANS, TRIAL_DAYS } from '@/lib/accounts';
import { cardOnFile, stripeEnabled, stripePublishableKey, stripeTestMode } from '@/lib/billing';
import { SaveCardForm } from '@/components/signup/CardForms';
import { freeAuditSummary, requireOnboardingStep, stepPath } from '@/lib/signup';
import { finishSignupAction } from '../actions';

export const metadata: Metadata = { title: 'Connect and approve' };
export const dynamic = 'force-dynamic';

const OPTIONS = [
  { id: 'gsc', title: 'Search Console', body: 'Your real clicks, rankings and indexing problems.', icon: 'search' },
  { id: 'ga4', title: 'Google Analytics', body: 'Visits, calls and leads from search.', icon: 'bars' },
  { id: 'gbp', title: 'Business Profile', body: 'Your Google Maps listing and reviews.', icon: 'pin' },
  { id: 'cms', title: 'Website admin', body: 'So approved fixes can be applied for you.', icon: 'code' },
] as const;

/** Step 5 · Connect and approve (design 5-connect-and-approve.png). Nothing is connected today. */
type Props = { searchParams: Promise<{ payment?: string }> };

export default async function ConnectPage({ searchParams }: Props) {
  const { payment } = await searchParams;
  const { account } = await requireOnboardingStep(5);
  const audit = await freeAuditSummary(account.sourceAuditId);
  const cardField = stripePublishableKey();
  const needsCard = Boolean(cardField) && !cardOnFile(account);
  // Without the card field (no publishable key), Stripe Checkout takes the card after this step.
  const billing = stripeEnabled() && !cardField && !cardOnFile(account);
  return (
    <SignupShell step={5} plan={account.plan} audit={audit} signedIn>
      <StepHeading step={5} title="Last step: connect and approve" intro="Tick what you can give us access to. Nothing is connected today. We will set it up with you." />
      {payment === 'cancelled' && <p role="status" className="mb-4 rounded-tile bg-sunken px-4 py-3 text-sm">No card was added, so your trial has not started yet. Your answers are saved: press the button again when you are ready.</p>}
      {payment === 'failed' && <p role="alert" className="mb-4 rounded-tile bg-fail-bg px-4 py-3 text-sm font-semibold text-fail-text">We could not confirm your payment details. Please try again, or contact us if it keeps happening.</p>}
      {needsCard && cardField && <div className="mb-6"><SaveCardForm publishableKey={cardField} trialDays={TRIAL_DAYS} price={`${PLANS[account.plan].price}${PLANS[account.plan].unit}`} testMode={stripeTestMode()} /></div>}
      <StepForm action={finishSignupAction} submit={billing ? 'Continue to secure payment' : 'Finish setup'} backHref={stepPath(4)}>
        <fieldset>
          <legend className="sr-only">What you can give us access to</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OPTIONS.map((o) => (
              <label key={o.id} className="relative flex cursor-pointer gap-4 rounded-card border border-border bg-surface p-5 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-sunken text-ink">
                  <Icon name={o.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1 pr-6">
                  <span className="block font-bold">{o.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-ink-2">{o.body}</span>
                </span>
                <input type="checkbox" name="connections" value={o.id} defaultChecked={account.connections.includes(o.id)} className="absolute right-4 top-4 size-5 accent-primary" />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex cursor-pointer gap-4 rounded-card bg-night p-5 text-mist">
          <input type="checkbox" name="consent" defaultChecked={account.consentChanges} className="mt-1 size-5 shrink-0 accent-primary" />
          <span>
            <span className="block font-bold">I allow MSScore to prepare changes to my website</span>
            <span className="mt-1 block text-sm leading-6 text-mist-2">Nothing goes live until I approve it. I can undo any change in one click, and nothing changes until my website ownership is verified.</span>
          </span>
        </label>
        {billing && (
          <p className="text-sm leading-6 text-ink-2">
            Next you add a card on Stripe’s secure payment page. Nothing is charged for {TRIAL_DAYS} days, and you can cancel before then from your account.
            {stripeTestMode() && <span className="mt-1 block font-semibold text-ink">Test mode: no real money moves. Use card 4242 4242 4242 4242, any future date and any CVC.</span>}
          </p>
        )}
      </StepForm>
    </SignupShell>
  );
}
