import Link from 'next/link';
import { cancelPlanAction, changePlanAction, restartPlanAction } from '@/app/(customer)/my/account/actions';
import { ActionForm } from '@/components/forms/ActionForm';
import { PLANS, type Account, type PlanId } from '@/lib/accounts';
import { SUPPORT_EMAIL } from '@/lib/site';
import { cn } from '@/lib/tones';

/** Self-service plan: switch Autopilot ↔ Growth, cancel, restart (the team invoices by hand). */
const STATUS = { trial: 'Free trial', active: 'Active', cancelled: 'Cancelled' } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export type BillingView = { enabled: boolean; test: boolean; notice?: string | null };
const BILLING_STATUS: Record<string, string> = { trialing: 'Card on file · free trial', active: 'Paid monthly by card', past_due: 'Last payment failed: update your card', canceled: 'No active payment', unpaid: 'Unpaid: update your card', incomplete: 'Payment not finished', incomplete_expired: 'Payment not finished', paused: 'Paused: add a card', card_needed: 'No card saved yet' };
const NOTICES: Record<string, string> = { ok: 'Thank you: your card is saved with Stripe.', portal: 'The payment settings page is not ready yet. Please contact us and we will update your card.', error: 'We could not confirm that payment page. Please try again.' };

export function PlanSettings({ account, sites, billing }: { account: Account; sites: string[]; billing?: BillingView }) {
  const plan = PLANS[account.plan];
  const cancelled = account.status === 'cancelled';
  const trialLeft = Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000);

  return (
    <section className="rounded-panel border border-border bg-surface p-6" aria-labelledby="plan">
      <h2 id="plan" className="font-display text-lg font-bold">Your plan</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
        <dt className="text-ink-3">Plan</dt>
        <dd className="font-semibold">{plan.name} · {plan.price}{plan.unit}</dd>
        <dt className="text-ink-3">Status</dt>
        <dd className={cn('font-semibold', cancelled && 'text-fail-text')}>
          {STATUS[account.status]}
          {account.status === 'trial' && <span className="font-normal text-ink-2"> · {trialLeft > 0 ? `ends ${date(account.trialEndsAt)} (${trialLeft} ${trialLeft === 1 ? 'day' : 'days'} left)` : `ended ${date(account.trialEndsAt)}`}</span>}
        </dd>
        {billing?.enabled && (
          <>
            <dt className="text-ink-3">Payment</dt>
            <dd className={cn(['past_due', 'unpaid'].includes(account.billingStatus ?? '') && 'font-semibold text-fail-text')}>
              {account.billingStatus ? (BILLING_STATUS[account.billingStatus] ?? account.billingStatus) : 'No card added yet'}
              {account.stripeCustomerId && <> · <a href="/api/stripe/portal" className="font-semibold text-primary-text hover:underline">Manage payment</a></>}
              {billing.test && <span className="block text-[13px] text-ink-3">Stripe test mode: no real money moves.</span>}
            </dd>
          </>
        )}
        <dt className="text-ink-3">Websites</dt>
        <dd className="break-all">{sites.length} of {plan.websites}{sites.length ? ` · ${sites.map(host).join(', ')}` : ''}</dd>
      </dl>

      {billing?.notice && NOTICES[billing.notice] && <p role="status" className="mt-4 rounded-tile bg-sunken px-4 py-3 text-sm">{NOTICES[billing.notice]}</p>}
      {billing?.enabled && !cancelled && (!account.stripeSubscriptionId || account.billingStatus === 'card_needed') && (
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-sm text-ink-2">Add a card to keep your plan running after the trial. Nothing is charged until the trial ends.</p>
          <ActionForm action={restartPlanAction} submit="Add a card">
            <span className="sr-only">Add a card for {plan.name}</span>
          </ActionForm>
        </div>
      )}
      {cancelled ? (
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-sm text-ink-2">Weekly checks and new audits are paused. Your reports are still here.</p>
          <ActionForm action={restartPlanAction} submit="Restart my plan">
            <span className="sr-only">Restart {plan.name}</span>
          </ActionForm>
        </div>
      ) : (
        <>
          {/* One form for every plan, so the result message stays on screen after the switch. */}
          <div className="mt-6">
            <ActionForm action={changePlanAction} submit="Change plan" tone="secondary">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">Change plan</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(Object.keys(PLANS) as PlanId[]).map((id) => {
                    const p = PLANS[id];
                    const current = id === account.plan;
                    return (
                      <label key={`${id}-${account.plan}`} className="cursor-pointer">
                        <input type="radio" name="plan" value={id} defaultChecked={current} className="peer sr-only" />
                        <span className={cn('flex h-full flex-col gap-1 rounded-tile border border-border p-4 peer-checked:border-night peer-checked:bg-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-primary')}>
                          <span className="font-display text-[17px] font-bold">{p.name}</span>
                          <span className="text-sm text-ink-2 tabular">{p.price}{p.unit} · {p.websites} {p.websites === 1 ? 'website' : 'websites'}</span>
                          {current && <span className="text-sm font-semibold text-pass-text">Your current plan</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </ActionForm>
          </div>
          <p className="mt-3 text-[13px] text-ink-3">
            {account.status === 'trial' ? 'Nothing to pay during your trial. ' : 'Your next invoice uses the new price. '}
            Need more than {PLANS.growth.websites} websites? <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Full package: ${account.businessName}`)}`} className="font-semibold text-primary-text hover:underline">Ask about the full package</a>.
            {plan.websites > 1 && <> Add or remove websites on <Link href="/my" className="font-semibold text-primary-text hover:underline">your dashboard</Link>.</>}
          </p>

          <details className="mt-6 border-t border-border pt-4">
            <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold text-ink-2 hover:text-ink">Cancel your plan</summary>
            <div className="mt-3">
              <ActionForm action={cancelPlanAction} submit="Cancel my plan" tone="secondary">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Why are you leaving? <span className="font-normal text-ink-3">(optional, helps us improve)</span>
                  <textarea name="reason" rows={2} maxLength={500} className="rounded-control border border-border-strong bg-surface px-3 py-2 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-primary" />
                  <span>I understand weekly checks and new audits stop. My reports stay, and I can restart at any time.</span>
                </label>
              </ActionForm>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
