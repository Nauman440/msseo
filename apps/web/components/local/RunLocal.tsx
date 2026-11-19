'use client';

import { useActionState } from 'react';
import { runLocalAction, type LocalState } from '@/app/local/actions';
import { Message, Submit } from '@/components/competitors/forms';

/** Starts a local SEO audit (about one to two minutes: 75 map checks, reviews, listings). */
export function RunLocal({ domain, again, disabledReason }: { domain: string; again: boolean; disabledReason?: string | null }) {
  const [state, action] = useActionState<LocalState>(runLocalAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      {disabledReason ? (
        <p className="text-sm font-semibold text-ink-2">{disabledReason}</p>
      ) : (
        <form action={action}>
          <Submit label={again ? 'Run the local audit again' : 'Run the local audit'} busy="Checking… (one to two minutes)" />
        </form>
      )}
      <Message state={state} />
    </div>
  );
}
