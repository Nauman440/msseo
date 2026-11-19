'use client';

import { useActionState } from 'react';
import { runAeoAction, type AeoState } from '@/app/ai-search/actions';
import { Message, Submit } from '@/components/competitors/forms';

export function RunAeo({ domain, again, disabledReason }: { domain: string; again: boolean; disabledReason?: string | null }) {
  const [state, action] = useActionState<AeoState>(runAeoAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      {disabledReason ? (
        <p className="text-sm font-semibold text-ink-2">{disabledReason}</p>
      ) : (
        <form action={action}>
          <Submit label={again ? 'Check AI search again' : 'Check AI search'} busy="Asking the assistants… (1–2 minutes)" />
        </form>
      )}
      <Message state={state} />
    </div>
  );
}
