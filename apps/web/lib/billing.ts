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
/** An env value without stray spaces or quotes (Coolify keeps quotes typed around a value). */
const envKey = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n]?.trim().replace(/^['"]|['"]$/g, '').trim();
    if (v) return v;
  }
  return '';
};
const secretKey = () => envKey('STRIPE_SECRET_KEY');
export const stripeEnabled = () => Boolean(secretKey());
export const stripeTestMode = () => /^(sk|rk)_test_/.test(secretKey());

const client = () => {
  const key = secretKey();
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
  // A trial whose card was never saved (card field): drop it, so Checkout does not make a second subscription.
  if (p.account.stripeSubscriptionId && p.account.billingStatus === 'card_needed') await client().cancel(await client().getSubscription(p.account.stripeSubscriptionId), true).catch(() => undefined);
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

/** A trial created before its card: the card setup is still open (our status `card_needed`). */
const cardMissing = (sub: StripeSubscription) => !sub.default_payment_method && Boolean(sub.pending_setup_intent) && sub.status === 'trialing';

/** Copies a subscription's state onto the account it belongs to. */
async function save(userId: string, sub: StripeSubscription) {
  const plan = await planOfPrice(sub.items.data[0]?.price.id);
  await updateAccount(userId, {
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    billingStatus: cardMissing(sub) ? 'card_needed' : sub.status,
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

/** The publishable key for the card field (pk_test_… / pk_live_…), or null. */
export const stripePublishableKey = () => {
  const pk = envKey('STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  return stripeEnabled() && /^pk_(test|live)_/.test(pk) ? pk : null;
};

/** What the server sees, for /api/health (never the values): why the card field shows or not. */
/** Names (never values) of the STRIPE_ variables this process has, with "(empty)" for blank ones. */
const stripeVarNames = () =>
  Object.keys(process.env)
    .filter((k) => /STRIPE/i.test(k))
    .sort()
    .map((k) => (process.env[k]?.trim() ? k : `${k} (empty)`));

export function billingSetup(): { billing: string; mode?: 'test' | 'live'; stripeVariablesSeen: string[] } {
  const seen = stripeVarNames();
  const r = billingState();
  return { ...r, stripeVariablesSeen: seen };
}

function billingState(): { billing: string; mode?: 'test' | 'live' } {
  const sk = secretKey();
  const pk = envKey('STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  if (!sk) return { billing: pk ? 'not configured: STRIPE_SECRET_KEY is missing' : 'not configured' };
  const mode = /^(sk|rk)_live_/.test(sk) ? 'live' : 'test';
  if (!/^(sk|rk)_(test|live)_/.test(sk)) return { billing: 'STRIPE_SECRET_KEY does not start with sk_test_ or sk_live_', mode };
  if (!pk) return { billing: 'checkout only: STRIPE_PUBLISHABLE_KEY is missing, so no card field', mode };
  if (!/^pk_(test|live)_/.test(pk)) return { billing: 'checkout only: STRIPE_PUBLISHABLE_KEY does not start with pk_test_ or pk_live_', mode };
  if (pk.startsWith('pk_live_') !== (mode === 'live')) return { billing: 'card field on, but the two keys are from different modes (test and live)', mode };
  // Both keys carry the account they belong to right after the mode prefix (e.g. …_51RLjo1E4loiZlktA…).
  const acct = (k: string) => k.replace(/^(sk|rk|pk)_(test|live)_/, '').slice(0, 16);
  if (acct(pk) !== acct(sk)) return { billing: 'keys from two different Stripe accounts: copy both from the same Developers → API keys page', mode };
  return { billing: 'card field on', mode };
}

/** The card is saved with Stripe (trial, active or past due with a card on file). */
export const cardOnFile = (a: Pick<Account, 'billingStatus'>) => liveSubscription(a);

/**
 * Card field during sign-up: makes sure the account has a Stripe customer and a trial
 * subscription (trial days left, card only), and returns the client secret the browser
 * confirms the card with. `done` when a card is already saved.
 */
export async function startCardSetup(account: Account, who: { email: string | null; name: string | null }): Promise<{ clientSecret?: string; done?: boolean }> {
  const stripe = client();
  if (account.stripeSubscriptionId) {
    const sub = await stripe.getSubscriptionWithSetup(account.stripeSubscriptionId);
    if (['trialing', 'active', 'past_due'].includes(sub.status)) {
      const si = sub.pending_setup_intent;
      if (sub.default_payment_method || !si) {
        await save(account.userId, sub);
        return { done: true };
      }
      if (typeof si === 'object' && si.client_secret) return { clientSecret: si.client_secret };
    }
  }
  const customer = account.stripeCustomerId ?? (await stripe.createCustomer({ email: who.email, name: who.name ?? account.businessName, userId: account.userId })).id;
  const trialDays = Math.max(1, Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000));
  const sub = await stripe.createTrialSubscription({ customer, price: await priceFor(account.plan), trialDays, userId: account.userId, metadata: { plan: account.plan, business: account.businessName.slice(0, 200) } });
  await save(account.userId, sub);
  const si = sub.pending_setup_intent;
  if (si && typeof si === 'object' && si.client_secret) return { clientSecret: si.client_secret };
  return { done: Boolean(sub.default_payment_method) };
}

/** After the browser confirmed the card: it must be this customer's; it becomes the subscription's default card. */
export async function finishCardSetup(account: Account, setupIntentId: string): Promise<{ ok?: true; error?: string }> {
  if (!account.stripeSubscriptionId || !account.stripeCustomerId) return { error: 'Add your card again.' };
  const stripe = client();
  const si = await stripe.getSetupIntent(setupIntentId);
  if (si.customer !== account.stripeCustomerId) return { error: 'This card belongs to another account.' };
  if (si.status !== 'succeeded' || !si.payment_method) return { error: 'Your card was not confirmed. Please try again.' };
  let sub = await stripe.getSubscription(account.stripeSubscriptionId);
  if (!sub.default_payment_method) sub = await stripe.setDefaultCard(sub.id, si.payment_method);
  await save(account.userId, sub);
  return { ok: true };
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
