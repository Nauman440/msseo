'use client';

import { useActionState } from 'react';
import { runCustomerAuditAction, type RunState } from '@/app/(customer)/my/actions';

/** "Run audit again" for customers (design: site header), with the reason when it is refused. */
export function RunAuditButton({ disabled, site }: { disabled: boolean; site: string }) {
  const [state, action, pending] = useActionState<RunState>(runCustomerAuditAction.bind(null, site), {});
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex min-h-12 items-center gap-2 rounded-control border border-border-strong bg-surface px-5 text-[15px] font-semibold text-ink hover:border-ink-3 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
          <path d="M21 12a9 9 0 01-15.5 6.3L3 16M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M3 21v-5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending ? 'Starting…' : disabled ? 'Audit running…' : 'Run audit again'}
      </button>
      {state.error && <p role="alert" className="max-w-xs text-[13px] text-fail-text">{state.error}</p>}
    </form>
  );
}
