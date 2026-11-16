'use client';

import Script from 'next/script';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { startFreeAuditAction, type FreeAuditState } from '@/app/(marketing)/free/actions';

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void };
  }
}

const INPUT =
  'min-h-[52px] w-full rounded-control border border-border-strong bg-surface px-4 text-base text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-fail-text';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-[52px] w-full rounded-button bg-primary px-6 text-base font-extrabold text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-60 sm:w-auto">
      {pending ? 'Starting your audit…' : 'Run my free audit'}
    </button>
  );
}

/** Public free-audit form: website, optional email, Cloudflare Turnstile (when configured). */
export function FreeAuditForm({ defaultUrl, siteKey }: { defaultUrl: string; siteKey: string | null }) {
  const [state, action] = useActionState<FreeAuditState, FormData>(startFreeAuditAction, {});
  const err = state.fieldErrors ?? {};
  // A Turnstile token works once: get a fresh one after a refused attempt.
  useEffect(() => {
    if (state.error || state.fieldErrors) window.turnstile?.reset();
  }, [state]);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      {state.error && (
        <p role="alert" className="rounded-tile border border-fail-text/20 bg-fail-bg px-4 py-3 text-sm font-medium text-fail-text">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="free-url" className="text-sm font-bold">Your website</label>
        <input id="free-url" name="url" type="text" inputMode="url" autoComplete="url" required defaultValue={defaultUrl} placeholder="https://yourdomain.com" aria-invalid={!!err.url} aria-describedby={err.url ? 'free-url-error' : undefined} className={INPUT} />
        {err.url && <p id="free-url-error" className="text-sm text-fail-text">{err.url}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="free-email" className="text-sm font-bold">
          Email me the full report <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input id="free-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!err.email} aria-describedby={err.email ? 'free-email-error' : undefined} className={INPUT} />
        {err.email && <p id="free-email-error" className="text-sm text-fail-text">{err.email}</p>}
      </div>
      {siteKey && <div className="cf-turnstile min-h-[65px]" data-sitekey={siteKey} data-theme="light" />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Submit />
        <p className="text-[13px] text-ink-3">Free. No card needed. Checks up to 10 pages in about a minute.</p>
      </div>
    </form>
  );
}
