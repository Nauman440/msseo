'use client';

import { useActionState } from 'react';
import { startImplementingAction, undoWorkItemAction, type AutopilotActionState } from '@/app/autopilot/actions';
import { Message, Submit } from '@/components/competitors/forms';

export function StartImplementingButton({ domain, label }: { domain: string; label: string }) {
  const [state, action] = useActionState<AutopilotActionState>(startImplementingAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Submit label={label} busy="Starting…" />
      <Message state={state} />
    </form>
  );
}

export function UndoItemButton({ domain, id }: { domain: string; id: string }) {
  const [state, action] = useActionState<AutopilotActionState>(undoWorkItemAction.bind(null, domain, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Submit label="Undo" busy="Undoing…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}
