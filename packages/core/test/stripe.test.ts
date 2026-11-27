import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountStatusFor, createStripeClient, stripeForm, subscriptionIdOf, verifyStripeWebhook } from '../src/server';

const secret = 'whsec_test_secret';
const sign = (body: string, t: number, key = secret) => createHmac('sha256', key).update(`${t}.${body}`).digest('hex');

describe('stripe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes nested params the way Stripe reads them', () => {
    expect(stripeForm({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], subscription_data: { trial_period_days: 7, metadata: { userId: 'u 1' } } })).toBe(
      'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Btrial_period_days%5D=7&subscription_data%5Bmetadata%5D%5BuserId%5D=u%201',
    );
  });

  it('verifies v1 signatures only, within the time limit', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { object: 'subscription', id: 'sub_1' } } });
    const t = 1_800_000_000;
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${sign(body, t)},v0=${sign(body, t)},payload=abc`;
    expect(verifyStripeWebhook(body, header, secret, { now: t + 10 })?.id).toBe('evt_1');
    expect(verifyStripeWebhook(body, header, secret, { now: t + 1000 })).toBeNull();
    expect(verifyStripeWebhook(body, `t=${t},v0=${sign(body, t)}`, secret, { now: t })).toBeNull();
    expect(verifyStripeWebhook(`${body} `, header, secret, { now: t })).toBeNull();
    expect(verifyStripeWebhook(body, `t=${t},v1=${sign(body, t, 'whsec_other')}`, secret, { now: t })).toBeNull();
  });

  it('finds the subscription in snapshot and thin events', () => {
    expect(subscriptionIdOf({ data: { object: { object: 'subscription', id: 'sub_1' } } })).toBe('sub_1');
    expect(subscriptionIdOf({ data: { object: { object: 'checkout.session', id: 'cs_1', subscription: 'sub_2' } } })).toBe('sub_2');
    expect(subscriptionIdOf({ related_object: { id: 'sub_3', type: 'subscription' } })).toBe('sub_3');
    expect(subscriptionIdOf({ data: { object: { object: 'invoice', id: 'in_1' } } })).toBeNull();
  });

  it('maps subscription statuses to account statuses', () => {
    expect([accountStatusFor('trialing'), accountStatusFor('active'), accountStatusFor('past_due'), accountStatusFor('canceled'), accountStatusFor('unpaid')]).toEqual(['trial', 'active', 'active', 'cancelled', 'cancelled']);
  });

  it('reuses a price by lookup key, else creates it; sends form bodies with the API version', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let n = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(++n === 1 ? { data: [] } : { id: 'price_new' }), { status: 200 });
    });
    const s = createStripeClient('sk_test_x');
    expect(await s.monthlyPrice('msscore_growth_monthly', 'MS SCORE Growth', 22900)).toBe('price_new');
    expect(calls[0]!.url).toContain('/v1/prices?lookup_keys%5B0%5D=msscore_growth_monthly');
    expect(calls[1]!.init.body).toBe('currency=usd&unit_amount=22900&recurring%5Binterval%5D=month&product_data%5Bname%5D=MS%20SCORE%20Growth&lookup_key=msscore_growth_monthly');
    const h = calls[1]!.init.headers as Record<string, string>;
    expect(h['stripe-version']).toBe('2026-11-18.endive');
    expect(h['content-type']).toBe('application/x-www-form-urlencoded');
    expect(h.authorization).toBe('Bearer sk_test_x');
  });

  it('turns Stripe errors into a readable message', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'No such price', code: 'resource_missing' } }), { status: 400 }));
    await expect(createStripeClient('sk_test_x').getSubscription('sub_x')).rejects.toMatchObject({ message: 'No such price', status: 400, code: 'resource_missing' });
  });
});
