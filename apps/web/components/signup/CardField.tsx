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
type StripeElements = { create: (type: 'payment', o: object) => { mount: (el: HTMLElement) => void; on: (ev: 'ready' | 'change', cb: (e: { complete?: boolean }) => void) => void; destroy: () => void }; submit: () => Promise<{ error?: StripeError }> };
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
  const [failed, setFailed] = useState(false);
  const api = useRef<{ stripe: StripeJs; elements: StripeElements } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Stripe) setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !box.current || !window.Stripe || api.current) return;
    const stripe = window.Stripe(publishableKey);
    // Card only, matching the subscription's payment_settings.payment_method_types.
    const elements = stripe.elements({ mode: 'subscription', amount: 0, currency: 'usd', allowedPaymentMethodTypes: ['card'], appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS });
    const card = elements.create('payment', { layout: 'tabs', business: { name: 'MS SCORE' } });
    card.on('ready', () => setReady(true));
    card.mount(box.current);
    api.current = { stripe, elements };
    return () => {
      card.destroy();
      api.current = null;
    };
  }, [loaded, publishableKey]);

  const field = (
    <div className="flex flex-col gap-1.5">
      <Script src={STRIPE_JS} strategy="afterInteractive" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      <span className={SIGNUP_LABEL}>Card details</span>
      <div ref={box} className="min-h-[56px]" aria-busy={!ready} />
      {!ready && !failed && <span className={SIGNUP_HINT}>Loading the secure card field…</span>}
      {failed && <span role="alert" className="text-sm font-medium text-fail-text">The secure card field could not load. Check your connection and reload the page.</span>}
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
