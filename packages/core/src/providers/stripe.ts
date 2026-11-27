import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError, request, type HttpLog } from './http';

/**
 * Stripe (docs.stripe.com, checked 2026-11-27, API version 2026-11-18.endive): form-encoded
 * requests with a Bearer secret key. Used for the sign-up trial: Checkout in `subscription` mode
 * with `subscription_data[trial_period_days]`, subscriptions (retrieve, change price, cancel),
 * the customer portal, and webhook signatures (`Stripe-Signature: t=…,v1=…`, HMAC-SHA256 of
 * "<t>.<raw body>" with the endpoint's `whsec_` secret; only v1 entries count).
 * Server only (node:crypto): exported from `@seo/core/server`.
 */
export const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_VERSION = '2026-11-18.endive';

export type StripeSubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export type StripeSubscription = {
  id: string;
  status: StripeSubscriptionStatus;
  customer: string;
  cancel_at_period_end: boolean;
  trial_end: number | null;
  metadata: Record<string, string>;
  items: { data: { id: string; price: { id: string; lookup_key: string | null }; current_period_end?: number }[] };
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired' | null;
  customer: string | null;
  subscription: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string>;
};

/** Flattens an object into Stripe's form encoding: a[b][0][c]=v. */
export function stripeForm(params: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${key}[${i}]`, x));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(`${key}[${k}]`, x);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.join('&');
}

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function createStripeClient(secretKey: string, log?: HttpLog) {
  const call = async <T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}): Promise<T> => {
    const form = stripeForm(params);
    const url = `${STRIPE_API}${path}${method === 'GET' && form ? `?${form}` : ''}`;
    const res = await request(url, {
      provider: 'stripe',
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        'stripe-version': STRIPE_VERSION,
        ...(method !== 'GET' ? { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': randomUUID() } : {}),
      },
      ...(method !== 'GET' && form ? { rawBody: form } : {}),
      timeoutMs: 30_000,
      log,
    });
    const text = await res.text();
    let json: { error?: { message?: string; code?: string } } & Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpError(`stripe returned invalid JSON (${res.status})`, res.status, text.slice(0, 300));
    }
    if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe ${res.status}`, res.status, json.error?.code);
    return json as T;
  };

  return {
    /** A monthly price with this lookup key, created (with its product) the first time. */
    async monthlyPrice(lookupKey: string, name: string, cents: number, currency = 'usd'): Promise<string> {
      const found = await call<{ data: { id: string }[] }>('GET', '/v1/prices', { lookup_keys: [lookupKey], active: true, limit: 1 });
      if (found.data[0]) return found.data[0].id;
      const made = await call<{ id: string }>('POST', '/v1/prices', { currency, unit_amount: cents, recurring: { interval: 'month' }, product_data: { name }, lookup_key: lookupKey });
      return made.id;
    },
    createCheckout(p: {
      price: string;
      trialDays: number;
      successUrl: string;
      cancelUrl: string;
      userId: string;
      email?: string | null;
      customer?: string | null;
      metadata?: Record<string, string>;
    }): Promise<StripeCheckoutSession> {
      return call('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: p.price, quantity: 1 }],
        ...(p.customer ? { customer: p.customer } : p.email ? { customer_email: p.email } : {}),
        client_reference_id: p.userId,
        metadata: { userId: p.userId, ...p.metadata },
        subscription_data: {
          ...(p.trialDays > 0 ? { trial_period_days: p.trialDays, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
          metadata: { userId: p.userId, ...p.metadata },
        },
        payment_method_collection: 'always',
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
      });
    },
    getCheckout: (id: string) => call<StripeCheckoutSession>('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`),
    getSubscription: (id: string) => call<StripeSubscription>('GET', `/v1/subscriptions/${encodeURIComponent(id)}`),
    /** Moves the subscription's single item to another price (no proration during a trial). */
    changePrice: (sub: StripeSubscription, price: string) =>
      call<StripeSubscription>('POST', `/v1/subscriptions/${encodeURIComponent(sub.id)}`, {
        items: [{ id: sub.items.data[0]?.id, price }],
        proration_behavior: sub.status === 'trialing' ? 'none' : 'create_prorations',
      }),
    /** Cancels now (`now`) or at the end of the paid period. */
    cancel: (sub: StripeSubscription, now: boolean) =>
      now
        ? call<StripeSubscription>('DELETE', `/v1/subscriptions/${encodeURIComponent(sub.id)}`)
        : call<StripeSubscription>('POST', `/v1/subscriptions/${encodeURIComponent(sub.id)}`, { cancel_at_period_end: true }),
    resume: (sub: StripeSubscription) => call<StripeSubscription>('POST', `/v1/subscriptions/${encodeURIComponent(sub.id)}`, { cancel_at_period_end: false }),
    portal: (customer: string, returnUrl: string) => call<{ url: string }>('POST', '/v1/billing_portal/sessions', { customer, return_url: returnUrl }),
  };
}
export type StripeClient = ReturnType<typeof createStripeClient>;

/**
 * Verifies a webhook's Stripe-Signature header against the raw body. Returns the parsed event,
 * or null when no v1 signature matches or the timestamp is more than `toleranceSec` away.
 */
export function verifyStripeWebhook<T = { id: string; type: string; data?: { object?: Record<string, unknown> }; related_object?: { id: string; type: string } }>(
  rawBody: string,
  header: string | null,
  secret: string,
  opts: { toleranceSec?: number; now?: number } = {},
): T | null {
  if (!header || !secret) return null;
  let t = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!/^\d+$/.test(t) || !v1.length) return null;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > (opts.toleranceSec ?? 300)) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest();
  const ok = v1.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const got = Buffer.from(sig, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) return null;
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return null;
  }
}

/** The subscription a webhook event is about (snapshot or thin events), or null. */
export function subscriptionIdOf(event: { type?: string; data?: { object?: Record<string, unknown> }; related_object?: { id: string; type: string } }): string | null {
  const o = event.data?.object;
  if (o?.object === 'subscription' && typeof o.id === 'string') return o.id;
  if (o && typeof o.subscription === 'string') return o.subscription;
  if (event.related_object?.type === 'subscription') return event.related_object.id;
  return null;
}

/** Our account status for a Stripe subscription status. */
export function accountStatusFor(s: StripeSubscriptionStatus): 'trial' | 'active' | 'cancelled' {
  if (s === 'trialing') return 'trial';
  if (s === 'active' || s === 'past_due') return 'active';
  return 'cancelled';
}
