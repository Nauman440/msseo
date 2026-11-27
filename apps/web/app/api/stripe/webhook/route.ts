import { NextResponse, type NextRequest } from 'next/server';
import { subscriptionIdOf, verifyStripeWebhook } from '@seo/core/server';
import { stripeEnabled, syncSubscription } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook (public; authenticated by the Stripe-Signature header and STRIPE_WEBHOOK_SECRET).
 * For any event about a subscription (checkout.session.completed, customer.subscription.*,
 * invoice.*), the subscription is read again from Stripe and copied onto the account, so the
 * order or duplication of events does not matter. Works with snapshot and thin events.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeEnabled() || !secret) return NextResponse.json({ error: 'Stripe is not set up' }, { status: 503 });
  const body = await req.text();
  const event = verifyStripeWebhook(body, req.headers.get('stripe-signature'), secret);
  if (!event) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const sub = subscriptionIdOf(event);
  if (!sub) return NextResponse.json({ received: true, ignored: event.type });
  try {
    const found = await syncSubscription(sub);
    return NextResponse.json({ received: true, account: found });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'stripe webhook sync failed', event: event.id, type: event.type, error: String(err) }));
    return NextResponse.json({ error: 'sync failed' }, { status: 500 }); // Stripe retries
  }
}
