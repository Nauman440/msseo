'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/tones';

export type ActionState = { error?: string; ok?: string };

function Submit({ label, tone }: { label: string; tone: 'primary' | 'secondary' }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-button px-5 text-sm font-bold transition-colors disabled:opacity-60',
        tone === 'primary' ? 'bg-primary text-primary-ink hover:bg-primary-hover' : 'border border-border-strong bg-surface text-ink hover:border-ink-3',
      )}
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

/** Server-action form with inline success/error feedback; fields are passed as children. */
export function ActionForm({
  action,
  submit,
  tone = 'primary',
  className,
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submit: string;
  tone?: 'primary' | 'secondary';
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submit} tone={tone} />
        <p aria-live="polite" className={cn('text-sm font-semibold', state.error ? 'text-fail-text' : 'text-pass-text')}>
          {state.error ?? state.ok}
        </p>
      </div>
    </form>
  );
}
