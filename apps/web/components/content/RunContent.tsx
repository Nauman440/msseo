'use client';

import { useActionState } from 'react';
import { runContentAction, type ContentState } from '@/app/content/actions';
import { Message, Submit } from '@/components/competitors/forms';

export function RunContent({ domain, again }: { domain: string; again: boolean }) {
  const [state, action] = useActionState<ContentState>(runContentAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      <form action={action}>
        <Submit label={again ? 'Check content again' : 'Check content'} busy="Checking… (about a minute)" />
      </form>
      <Message state={state} />
    </div>
  );
}
