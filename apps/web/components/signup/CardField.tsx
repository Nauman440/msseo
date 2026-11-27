'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { STRIPE_APPEARANCE, STRIPE_FONTS } from '@/lib/tones';
import { SIGNUP_HINT, SIGNUP_LABEL } from './styles';

/**
 * Stripe's Payment Element (card only) for the sign-up trial. The card number is typed into
 * Stripe's own iframe, so it never reaches our server. Stripe.js must be loaded from
 * js.stripe.com (versioned URL from docs.stripe.com, checked 2026-11-27). `amount: 0` because
 * nothing is charged until the trial ends.
 */
type StripeError = { message?: string };
type StripeElements = { create: (type: 'payment', o: object) => { mount: (el: HTMLElement) => void; on: (ev: 'ready' | 'change' | 'loaderror', cb: (e: { complete?: boolean; error?: StripeError }) => void) => void; destroy: () => void }; submit: () => Promise<{ error?: StripeError }> };
export type StripeJs = {
  elements: (o: object) => StripeElements;
  confirmSetup: (o: { elements: StripeElements; clientSecret: string; confirmParams: { return_url: string }; redirect: 'if_required' }) => Promise<{ error?: StripeError; setupIntent?: { id: string; status: string } }>;
};
declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs;
  }
}

export const STRIPE_JS = 'https://js.stripe.com/endive/stripe.js';

/** Mounts the card field; returns Stripe and its Elements once ready. */
export function useCardField(publishableKey: string) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const api = useRef<{ stripe: StripeJs; elements: StripeElements } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Stripe) setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !box.current || !window.Stripe || api.current) return;
    let stripe: StripeJs;
    try {
      stripe = window.Stripe(publishableKey);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Stripe did not start.');
      return;
    }
    // Card only, matching the subscription's payment_settings.payment_method_types.
    let card: ReturnType<StripeElements['create']>;
    let elements: StripeElements;
    try {
      elements = stripe.elements({ mode: 'subscription', amount: 0, currency: 'usd', allowedPaymentMethodTypes: ['card'], appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS });
      card = elements.create('payment', { layout: 'tabs', business: { name: 'MS SCORE' } });
    } catch (err) {
      console.error('Stripe card field', err);
      setFailed(err instanceof Error ? err.message : 'The card field could not be created.');
      return;
    }
    card.on('ready', () => setReady(true));
    // Stripe answers here when it refuses to load the form (key, account or payment-method settings).
    card.on('loaderror', (e) => {
      console.error('Stripe card field loaderror', e.error);
      setFailed(e.error?.message ?? 'Stripe could not load the card form.');
    });
    card.mount(box.current);
    api.current = { stripe, elements };
    const slow = window.setTimeout(() => setFailed((f) => f ?? (api.current && !box.current?.querySelector('iframe') ? 'The secure card field did not appear. Reload the page; if it stays empty, a browser extension may be blocking Stripe.' : null)), 15_000);
    return () => {
      window.clearTimeout(slow);
      card.destroy();
      api.current = null;
    };
  }, [loaded, publishableKey]);

  const field = (
    <div className="flex flex-col gap-1.5">
      <Script src={STRIPE_JS} strategy="afterInteractive" onLoad={() => setLoaded(true)} onError={() => setFailed('The secure card field could not load. Check your connection, turn off ad blockers for this page and reload.')} />
      <span className={SIGNUP_LABEL}>Card details</span>
      <div ref={box} className="min-h-[56px]" aria-busy={!ready} />
      {!ready && !failed && <span className={SIGNUP_HINT}>Loading the secure card field…</span>}
      {failed && <span role="alert" className="text-sm font-medium text-fail-text">{failed}</span>}
    </div>
  );
  return { field, ready, api };
}

/** "Nothing is charged today" note under the card field. */
export function CardNote({ trialDays, price, testMode }: { trialDays: number; price: string; testMode: boolean }) {
  return (
    <p className={SIGNUP_HINT}>
      Nothing is charged today. Your card is charged {price} on day {trialDays + 1}, then every month. Cancel any time before then from your account. Card details go straight to Stripe; we never see the number.
      {testMode && <span className="mt-1 block font-semibold text-ink">Test mode: no real money moves. Use card 4242 4242 4242 4242, any future date, any CVC and any postcode.</span>}
    </p>
  );
}
