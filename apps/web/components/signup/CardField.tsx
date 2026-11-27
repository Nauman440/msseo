'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { cn, STRIPE_APPEARANCE, STRIPE_CARD_STYLE, STRIPE_FONTS } from '@/lib/tones';
import { SIGNUP_HINT, SIGNUP_LABEL } from './styles';

/**
 * The card field for the sign-up trial. The card number is typed into Stripe's own iframe, so it
 * never reaches our server. Stripe.js must be loaded from js.stripe.com (versioned URL from
 * docs.stripe.com, checked 2026-11-27).
 *
 * First choice: the Payment Element (deferred intent, `amount: 0` because nothing is charged until
 * the trial ends). It reads the account's payment-method settings in the Stripe dashboard; when
 * those allow nothing for USD, Stripe answers `loaderror` "No valid payment method types", and
 * the field switches to Stripe's plain Card Element, which does not depend on those settings and
 * is confirmed with `stripe.confirmCardSetup`.
 */
type StripeError = { message?: string; type?: string };
type StripeEvent = { complete?: boolean; error?: StripeError };
type StripeElement = { mount: (el: HTMLElement) => void; on: (ev: 'ready' | 'change' | 'loaderror', cb: (e: StripeEvent) => void) => void; destroy: () => void };
type StripeElements = { create: (type: 'payment' | 'card', o: object) => StripeElement; submit: () => Promise<{ error?: StripeError }> };
type SetupResult = Promise<{ error?: StripeError; setupIntent?: { id: string; status: string } }>;
export type StripeJs = {
  elements: (o: object) => StripeElements;
  confirmSetup: (o: { elements: StripeElements; clientSecret: string; confirmParams: { return_url: string }; redirect: 'if_required' }) => SetupResult;
  confirmCardSetup: (clientSecret: string, data: { payment_method: { card: StripeElement } }) => SetupResult;
};
declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs;
  }
}

export const STRIPE_JS = 'https://js.stripe.com/endive/stripe.js';

/** What the forms use: Stripe, and either the Payment Element or the plain card field. */
export type CardApi =
  | { kind: 'payment'; stripe: StripeJs; elements: StripeElements }
  | { kind: 'card'; stripe: StripeJs; card: StripeElement; complete: boolean; error: string | null };

/** Checks the card before anything is created; returns a message to show, or null. */
export async function checkCard(api: CardApi | null): Promise<string | null> {
  if (!api) return 'The secure card field is still loading.';
  if (api.kind === 'card') return api.error ?? (api.complete ? null : 'Enter your card number, expiry date and CVC.');
  const r = await api.elements.submit();
  return r.error ? (r.error.message ?? 'Check your card details.') : null;
}

/** Confirms the card on the trial's setup with whichever field is showing. */
export function confirmCard(api: CardApi, clientSecret: string): SetupResult {
  if (api.kind === 'card') return api.stripe.confirmCardSetup(clientSecret, { payment_method: { card: api.card } });
  return api.stripe.confirmSetup({ elements: api.elements, clientSecret, confirmParams: { return_url: `${window.location.origin}/api/stripe/card-return` }, redirect: 'if_required' });
}

/** Mounts the card field; returns Stripe and its field once ready. */
export function useCardField(publishableKey: string) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [plain, setPlain] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const api = useRef<CardApi | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Stripe) setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !box.current || !window.Stripe || api.current) return;
    const host = box.current;
    let stripe: StripeJs;
    try {
      stripe = window.Stripe(publishableKey);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Stripe did not start.');
      return;
    }
    let element: StripeElement | null = null;

    // The plain card field: used when the Payment Element has nothing it may show.
    const plainCard = () => {
      const card = stripe.elements({ fonts: STRIPE_FONTS }).create('card', { style: STRIPE_CARD_STYLE, hidePostalCode: false });
      const state: CardApi = { kind: 'card', stripe, card, complete: false, error: null };
      card.on('ready', () => setReady(true));
      card.on('change', (e) => {
        state.complete = Boolean(e.complete);
        state.error = e.error?.message ?? null;
      });
      card.mount(host);
      element = card;
      api.current = state;
      setPlain(true);
      setFailed(null);
    };

    try {
      const elements = stripe.elements({ mode: 'subscription', amount: 0, currency: 'usd', allowedPaymentMethodTypes: ['card'], appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS });
      const payment = elements.create('payment', { layout: 'tabs', business: { name: 'MS SCORE' } });
      payment.on('ready', () => setReady(true));
      payment.on('loaderror', (e) => {
        console.error('Stripe card field loaderror; using the plain card field', e.error);
        payment.destroy();
        element = null;
        api.current = null;
        setReady(false);
        try {
          plainCard();
        } catch (err) {
          setFailed(e.error?.message ?? (err instanceof Error ? err.message : 'Stripe could not load the card form.'));
        }
      });
      payment.mount(host);
      element = payment;
      api.current = { kind: 'payment', stripe, elements };
    } catch (err) {
      console.error('Stripe card field', err);
      try {
        plainCard();
      } catch {
        setFailed(err instanceof Error ? err.message : 'The card field could not be created.');
      }
    }
    const slow = window.setTimeout(() => setFailed((f) => f ?? (!host.querySelector('iframe') ? 'The secure card field did not appear. Reload the page; if it stays empty, a browser extension may be blocking Stripe.' : null)), 15_000);
    return () => {
      window.clearTimeout(slow);
      element?.destroy();
      api.current = null;
    };
  }, [loaded, publishableKey]);

  const field = (
    <div className="flex flex-col gap-1.5">
      <Script src={STRIPE_JS} strategy="afterInteractive" onLoad={() => setLoaded(true)} onError={() => setFailed('The secure card field could not load. Check your connection, turn off ad blockers for this page and reload.')} />
      <span className={SIGNUP_LABEL}>Card details</span>
      {/* The plain card field is one line without a frame of its own: it gets the same box as the other inputs. */}
      <div ref={box} className={cn('min-h-[56px]', plain && 'rounded-tile border border-border-strong bg-surface px-4 py-[18px]')} aria-busy={!ready} />
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
