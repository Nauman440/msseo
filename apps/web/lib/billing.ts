import 'server-only';
import { accountStatusFor, createStripeClient, StripeError, type StripeSubscription } from '@seo/core/server';
import { getAccountBySubscription, getAccountByUserId, PLANS, updateAccount, type Account, type PlanId } from './accounts';

/**
 * Stripe billing for customer accounts. On when STRIPE_SECRET_KEY is set (test keys `sk_test_…`
 * while we test; nothing is charged in test mode). Without it, sign-up works as before: the
 * trial is recorded and the team invoices by hand.
 *
 * Flow: the last onboarding step sends the customer to Stripe Checkout (subscription with a
 * TRIAL_DAYS free trial, card required). Stripe sends them back to /api/stripe/return, which
 * checks the session and finishes onboarding. /api/stripe/webhook keeps status, plan and trial
 * end in step with Stripe afterwards (card failures, cancellations in the portal, trial ends).
 */
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim());
export const stripeTestMode = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? '');

const client = () => {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('Stripe is not set up on this server.');
  return createStripeClient(key);
};

/** The monthly price for a plan: STRIPE_PRICE_<PLAN> when set, else one we create once by lookup key. */
async function priceFor(plan: PlanId): Promise<string> {
  const fixed = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim();
  if (fixed) return fixed;
  return client().monthlyPrice(`msscore_${plan}_monthly`, `MS SCORE ${PLANS[plan].name}`, PLANS[plan].cents);
}

const planOfPrice = async (priceId: string | undefined): Promise<PlanId | null> => {
  if (!priceId) return null;
  for (const plan of Object.keys(PLANS) as PlanId[]) if ((await priceFor(plan).catch(() => null)) === priceId) return plan;
  return null;
};

/** A subscription that still bills or will bill (trial, active, past due). */
export const liveSubscription = (a: Pick<Account, 'billingStatus'>) => ['trialing', 'active', 'past_due'].includes(a.billingStatus ?? '');

/** Stripe's message for a person, never a stack trace. */
export const billingError = (err: unknown) =>
  err instanceof StripeError ? `Stripe said: ${err.message}` : err instanceof Error ? err.message : 'Stripe could not be reached. Try again in a minute.';

/** A Checkout page for the account's plan; returns its address. */
export async function checkoutUrl(p: { account: Account; email: string | null; origin: string; trial: boolean; cancelPath: string }): Promise<string> {
  const s = await client().createCheckout({
    price: await priceFor(p.account.plan),
    trialDays: p.trial ? Math.max(1, Math.ceil((Date.parse(p.account.trialEndsAt) - Date.now()) / 86_400_000)) : 0,
    successUrl: `${p.origin}/api/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${p.origin}${p.cancelPath}`,
    userId: p.account.userId,
    email: p.email,
    customer: p.account.stripeCustomerId,
    metadata: { plan: p.account.plan, business: p.account.businessName.slice(0, 200) },
  });
  if (!s.url) throw new Error('Stripe did not return a payment page.');
  return s.url;
}

/** Copies a subscription's state onto the account it belongs to. */
async function save(userId: string, sub: StripeSubscription) {
  const plan = await planOfPrice(sub.items.data[0]?.price.id);
  await updateAccount(userId, {
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    billingStatus: sub.status,
    status: accountStatusFor(sub.status),
    ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000).toISOString() } : {}),
    ...(plan ? { plan } : {}),
  });
}

/** After Checkout: the session must be this user's and complete. Returns the account, or an error. */
export async function finishCheckout(sessionId: string, userId: string): Promise<{ account?: Account; error?: string }> {
  try {
    const s = await client().getCheckout(sessionId);
    if (s.client_reference_id !== userId) return { error: 'This payment page belongs to another account.' };
    if (s.status !== 'complete' || !s.subscription) return { error: 'The payment details were not finished. Try again.' };
    await save(userId, await client().getSubscription(s.subscription));
    const account = await getAccountByUserId(userId);
    return account ? { account } : { error: 'Account not found.' };
  } catch (err) {
    return { error: billingError(err) };
  }
}

/** Webhook: re-reads the subscription from Stripe (never trusts the event body) and saves it. */
export async function syncSubscription(subscriptionId: string): Promise<boolean> {
  const sub = await client().getSubscription(subscriptionId);
  const account = (await getAccountBySubscription(sub.id)) ?? (sub.metadata.userId ? await getAccountByUserId(sub.metadata.userId) : null);
  if (!account) return false;
  await save(account.userId, sub);
  return true;
}

const subscriptionOf = async (account: Account) => (account.stripeSubscriptionId ? client().getSubscription(account.stripeSubscriptionId) : null);

/** Plan switch on the account page: moves the Stripe subscription to the new price. */
export async function changeBillingPlan(account: Account, plan: PlanId): Promise<void> {
  const sub = await subscriptionOf(account);
  if (!sub || !['trialing', 'active', 'past_due'].includes(sub.status)) return;
  await save(account.userId, await client().changePrice(sub, await priceFor(plan)));
}

/** Cancel: during the trial at once (nothing is charged); otherwise at the end of the paid month. */
export async function cancelBilling(account: Account): Promise<'now' | 'period_end' | null> {
  const sub = await subscriptionOf(account);
  if (!sub || !['trialing', 'active', 'past_due'].includes(sub.status)) return null;
  const now = sub.status === 'trialing';
  // At period end the plan keeps running until then; the webhook marks it cancelled when it ends.
  await save(account.userId, await client().cancel(sub, now));
  return now ? 'now' : 'period_end';
}

/** Restart: undoes a cancel at period end, else null (a new Checkout is needed). */
export async function resumeBilling(account: Account): Promise<boolean> {
  const sub = await subscriptionOf(account);
  if (!sub || !sub.cancel_at_period_end || !['trialing', 'active', 'past_due'].includes(sub.status)) return false;
  await save(account.userId, await client().resume(sub));
  return true;
}

/** Stripe's billing portal (card, invoices). Needs the portal saved once in the Stripe dashboard. */
export async function portalUrl(account: Account, returnUrl: string): Promise<string> {
  if (!account.stripeCustomerId) throw new Error('There is no card on file yet.');
  return (await client().portal(account.stripeCustomerId, returnUrl)).url;
}
