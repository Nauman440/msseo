'use client';

import { useActionState } from 'react';
import { runCustomerAuditAction, type RunState } from '@/app/(customer)/my/actions';

/** "Run a new audit" for customers, with the reason when it is refused. */
export function RunAuditButton({ disabled, site }: { disabled: boolean; site: string }) {
  const [state, action, pending] = useActionState<RunState>(runCustomerAuditAction.bind(null, site), {});
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {pending ? 'Starting…' : disabled ? 'Audit running…' : 'Run a new audit'}
      </button>
      {state.error && <p role="alert" className="max-w-xs text-[13px] text-fail-text">{state.error}</p>}
    </form>
  );
}
