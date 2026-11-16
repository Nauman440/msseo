'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addWebsiteAction, type RunState } from '@/app/(customer)/my/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-11 shrink-0 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
      {pending ? 'Adding…' : 'Add website'}
    </button>
  );
}

/** Growth: add another website (the plan covers up to 3). */
export function AddWebsiteForm({ left }: { left: number }) {
  const [state, action] = useActionState<RunState, FormData>(addWebsiteAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="add-website" className="text-sm font-semibold">
        Add a website <span className="font-normal text-ink-3">({left} more on your plan)</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="add-website" name="website" type="text" inputMode="url" placeholder="https://anotherbusiness.com" className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />
        <Submit />
      </div>
      {state.error && <p role="alert" className="text-[13px] text-fail-text">{state.error}</p>}
    </form>
  );
}
