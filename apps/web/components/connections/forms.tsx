'use client';

import { useActionState } from 'react';
import { applyToSiteAction, checkConnectionAction, disconnectSiteAction, undoOnSiteAction, type ConnectionState } from '@/app/connections/actions';
import { Message, Submit } from '@/components/competitors/forms';

/** Site connection controls (client): check, disconnect, apply and undo. */
export function CheckAndDisconnect({ domain }: { domain: string }) {
  const [checked, check] = useActionState<ConnectionState>(checkConnectionAction.bind(null, domain), {});
  const [gone, disconnect] = useActionState<ConnectionState>(disconnectSiteAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <form action={check}>
          <Submit label="Check the connection" busy="Checking…" tone="secondary" />
        </form>
        <form action={disconnect}>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-control px-3 text-[15px] font-semibold text-fail-text hover:underline">Disconnect</button>
        </form>
      </div>
      <Message state={checked} />
      <Message state={gone} />
    </div>
  );
}

export function ApplyButton({ domain, id, count }: { domain: string; id: string; count: number }) {
  const [state, action] = useActionState<ConnectionState>(applyToSiteAction.bind(null, domain, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label={`Apply ${count} ${count === 1 ? 'change' : 'changes'} to your website`} busy="Applying… (checks the live page)" />
      <Message state={state} />
    </form>
  );
}

export function UndoButton({ domain, id }: { domain: string; id: string }) {
  const [state, action] = useActionState<ConnectionState>(undoOnSiteAction.bind(null, domain, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label="Undo on the website" busy="Undoing…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}
