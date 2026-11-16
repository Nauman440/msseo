'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { SignupState } from '@/app/(signup)/signup/actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[54px] items-center gap-2 rounded-button bg-primary px-8 text-base font-extrabold text-primary-ink shadow-[0_8px_24px_-8px_rgba(249,115,22,0.6)] transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
      {!pending && <span aria-hidden="true">→</span>}
    </button>
  );
}

/** One onboarding step: fields, error message, the orange continue button and "Back". */
export function StepForm({
  action,
  submit = 'Continue',
  backHref,
  children,
  footer,
}: {
  action: (prev: SignupState, form: FormData) => Promise<SignupState>;
  submit?: string;
  backHref?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {state.error && (
        <p role="alert" className="rounded-tile border border-fail-text/20 bg-fail-bg px-4 py-3 text-sm font-medium text-fail-text">
          {state.error}
        </p>
      )}
      {children}
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <Submit label={submit} />
        {backHref && (
          <Link href={backHref} className="inline-flex min-h-11 items-center text-base font-semibold text-ink-2 hover:text-ink">
            Back
          </Link>
        )}
      </div>
      {footer}
    </form>
  );
}

