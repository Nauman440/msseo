'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { createAccountForCardAction, finishCardSetupAction, startCardSetupAction } from '@/app/(signup)/signup/actions';
import { CardNote, checkCard, confirmCard, useCardField } from './CardField';

type Props = { publishableKey: string; trialDays: number; price: string; testMode: boolean };
const BUTTON = 'inline-flex min-h-[54px] items-center gap-2 rounded-button bg-primary px-8 text-base font-extrabold text-primary-ink shadow-[0_8px_24px_-8px_rgba(249,115,22,0.6)] transition-colors hover:bg-primary-hover disabled:opacity-60';

/** Saves the card on the open trial subscription: setup secret → Stripe confirms in the browser → we check it. */
async function saveCard(api: ReturnType<typeof useCardField>['api']): Promise<string | null> {
  const s = api.current;
  const problem = await checkCard(s);
  if (problem || !s) return problem ?? 'The secure card field is still loading.';
  const setup = await startCardSetupAction();
  if (setup.error) return setup.error;
  if (setup.done) return null;
  if (!setup.clientSecret) return 'Stripe did not start the card setup. Please try again.';
  const r = await confirmCard(s, setup.clientSecret);
  if (r.error) return r.error.message ?? 'Your card was not accepted. Try another card.';
  if (!r.setupIntent) return 'Your card was not confirmed. Please try again.';
  const done = await finishCardSetupAction(r.setupIntent.id);
  return done.error ?? null;
}

function Alert({ text }: { text: string | null }) {
  return text ? <p role="alert" className="rounded-tile border border-fail-text/20 bg-fail-bg px-4 py-3 text-sm font-medium text-fail-text">{text}</p> : null;
}

/**
 * Step 1 with Stripe on: the account fields plus the card field. "Create my account" makes the
 * login, then saves the card for the free trial. When the card fails, the account already
 * exists, so trying again only retries the card.
 */
export function AccountWithCardForm({ children, footer, ...p }: Props & { children: ReactNode; footer: ReactNode }) {
  const router = useRouter();
  const card = useCardField(p.publishableKey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(e.currentTarget);
      const problem = await checkCard(card.api.current);
      if (problem) return setError(problem);
      if (!created) {
        const made = await createAccountForCardAction(form);
        if (made.error) return setError(made.error);
        setCreated(true);
      }
      const failed = await saveCard(card.api);
      if (failed) return setError(`${failed} Your account is created: fix the card and press the button again.`);
      router.push('/signup/website');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Alert text={error} />
      <fieldset disabled={created} className="flex flex-col gap-6 disabled:opacity-70">{children}</fieldset>
      {card.field}
      <CardNote trialDays={p.trialDays} price={p.price} testMode={p.testMode} />
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <button type="submit" disabled={busy || !card.ready} className={BUTTON}>
          {busy ? 'Saving…' : created ? 'Save my card' : 'Create my account'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
      </div>
      {footer}
    </form>
  );
}

/** Step 5 (or later) when no card is saved yet: just the card field. */
export function SaveCardForm(p: Props & { backHref?: string }) {
  const router = useRouter();
  const card = useCardField(p.publishableKey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const failed = await saveCard(card.api);
      if (failed) return setError(failed);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Add your card to start the free trial</p>
      <Alert text={error} />
      {card.field}
      <CardNote trialDays={p.trialDays} price={p.price} testMode={p.testMode} />
      <div className="flex flex-wrap items-center gap-6">
        <button type="submit" disabled={busy || !card.ready} className={BUTTON}>
          {busy ? 'Saving…' : 'Save my card'}
        </button>
        {p.backHref && <Link href={p.backHref} className="inline-flex min-h-11 items-center text-base font-semibold text-ink-2 hover:text-ink">Back</Link>}
      </div>
    </form>
  );
}
