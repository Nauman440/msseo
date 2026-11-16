'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AuthFormState } from '@/app/(auth)/actions';

const INPUT =
  'min-h-12 w-full rounded-control border border-border-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export type AuthField = { name: string; label: string; type: 'text' | 'email' | 'password'; autoComplete: string; hint?: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-button bg-primary text-base font-extrabold text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-60">
      {pending ? 'One moment…' : label}
    </button>
  );
}

/** Small form shell for sign-in style pages (login, first-admin setup, password reset). */
export function AuthForm({
  action,
  fields,
  submit,
  hidden = {},
}: {
  action: (prev: AuthFormState, form: FormData) => Promise<AuthFormState>;
  fields: AuthField[];
  submit: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error && (
        <p role="alert" className="rounded-control bg-warn-bg px-3.5 py-2.5 text-sm font-semibold text-fail-text">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-control bg-pass-bg px-3.5 py-2.5 text-sm font-semibold text-pass-text">
          {state.ok}
        </p>
      )}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-sm font-semibold">
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} required className={INPUT} />
          {f.hint && <p className="text-[13px] text-ink-3">{f.hint}</p>}
        </div>
      ))}
      <Submit label={submit} />
    </form>
  );
}
