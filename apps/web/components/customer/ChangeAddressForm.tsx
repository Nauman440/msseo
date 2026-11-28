'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { changeWebsiteAddressAction, type RunState } from '@/app/(customer)/my/actions';
import { siteHost } from '@seo/core';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-10 shrink-0 items-center rounded-button bg-primary px-4 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
      {pending ? 'Saving…' : 'Save and audit'}
    </button>
  );
}

/** "Change address": correct a website's address on the same domain (e.g. a site that lives in /shop/). */
export function ChangeAddressForm({ site, address }: { site: string; address: string }) {
  const [state, action] = useActionState<RunState, FormData>(changeWebsiteAddressAction.bind(null, site), {});
  const id = `address-${site}`;
  return (
    <details className="w-full">
      <summary className="cursor-pointer text-[13px] font-semibold text-primary-heading underline">Change address</summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <label htmlFor={id} className="text-[13px] text-ink-2">
          The address where this website starts. If it lives in a folder, include it, for example https://{siteHost(site)}/shop/. A different folder counts as a different website: it starts with its own competitors, keywords, plans and connections.
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id={id} name="address" type="text" inputMode="url" defaultValue={address} className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />
          <Submit />
        </div>
        {state.error && <p role="alert" className="text-[13px] text-fail-text">{state.error}</p>}
      </form>
    </details>
  );
}
