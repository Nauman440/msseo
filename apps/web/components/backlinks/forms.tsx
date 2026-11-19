'use client';

import { useActionState, useState } from 'react';
import type { OutreachSource, OutreachTarget } from '@seo/core';
import { addOutreachAction, removeOutreachAction, runBacklinksAction, updateOutreachAction, type BacklinkState } from '@/app/backlinks/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';

/** Module 8 controls (client). */
export function RunBacklinks({ domain, again, disabledReason }: { domain: string; again: boolean; disabledReason?: string | null }) {
  const [state, action] = useActionState<BacklinkState>(runBacklinksAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      {disabledReason ? (
        <p className="text-sm font-semibold text-ink-2">{disabledReason}</p>
      ) : (
        <form action={action}>
          <Submit label={again ? 'Check backlinks again' : 'Check backlinks'} busy="Checking… (about a minute)" />
        </form>
      )}
      <Message state={state} />
    </div>
  );
}

/** "Add to outreach" next to a link opportunity, mention or broken link. */
export function AddToOutreach({ domain, target, source, reason, url, added }: { domain: string; target: string; source: OutreachSource; reason: string; url?: string | null; added: boolean }) {
  const [state, action] = useActionState<BacklinkState, FormData>(addOutreachAction.bind(null, domain), {});
  if (added || state.ok) return <span className="whitespace-nowrap text-[12px] font-semibold text-teal-text">On the list</span>;
  return (
    <form action={action}>
      <input type="hidden" name="domain" value={target} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="reason" value={reason} />
      {url && <input type="hidden" name="url" value={url} />}
      <button type="submit" aria-label={`Add ${target} to outreach`} className="min-h-9 whitespace-nowrap rounded-[8px] border border-border bg-surface px-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink-3">
        Add to outreach
      </button>
      {state.error && <p role="alert" className="text-[12px] text-fail-text">{state.error}</p>}
    </form>
  );
}

export function AddOutreachManual({ domain }: { domain: string }) {
  const [state, action] = useActionState<BacklinkState, FormData>(addOutreachAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="source" value="manual" />
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        Website
        <input name="domain" required placeholder="localnews.com" className={`${INPUT} min-h-10 w-56 text-sm font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        Why
        <input name="reason" placeholder="Sponsors local trades" maxLength={200} className={`${INPUT} min-h-10 w-64 max-w-full text-sm font-normal`} />
      </label>
      <Submit label="Add" busy="Adding…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}

const STATUS_LABEL: Record<OutreachTarget['status'], string> = { todo: 'To do', contacted: 'Contacted', replied: 'Replied', won: 'Link won', lost: 'No' };

/** One outreach row: status, contact, owner and notes (saved together). */
export function OutreachEditor({ domain, o }: { domain: string; o: OutreachTarget }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<BacklinkState, FormData>(updateOutreachAction.bind(null, domain, o.domain), {});
  const [, remove] = useActionState<BacklinkState>(removeOutreachAction.bind(null, domain, o.domain), {});
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`st-${o.domain}`}>Status of {o.domain}</label>
        <select id={`st-${o.domain}`} name="status" defaultValue={o.status} className={SELECT_SM} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen((x) => !x)} className="min-h-9 px-1 text-[13px] font-semibold text-primary-heading underline">{open ? 'Close' : 'Details'}</button>
        <Message state={state} />
      </form>
      {open && (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="status" value={o.status} />
          <label className="flex flex-col gap-1 text-[12.5px] font-bold">Contact<input name="contact" defaultValue={o.contact ?? ''} maxLength={200} className={`${INPUT} min-h-10 text-sm font-normal`} /></label>
          <label className="flex flex-col gap-1 text-[12.5px] font-bold">Owner<input name="owner" defaultValue={o.owner ?? ''} maxLength={80} className={`${INPUT} min-h-10 text-sm font-normal`} /></label>
          <label className="flex flex-col gap-1 text-[12.5px] font-bold">Notes<textarea name="notes" defaultValue={o.notes ?? ''} maxLength={600} rows={2} className={`${INPUT} py-2 text-sm font-normal`} /></label>
          <Submit label="Save" busy="Saving…" tone="secondary" />
        </form>
      )}
      {open && (
        <form action={remove}>
          <button type="submit" className="min-h-10 px-1 text-sm font-semibold text-fail-text underline">Remove from the list</button>
        </form>
      )}
    </div>
  );
}
