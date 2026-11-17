'use client';

import { useActionState, useRef } from 'react';
import type { MappingRow } from '@seo/core';
import { rebuildMappingAction, updateMappingRowAction, writeDraftsAction, type MappingState } from '@/app/mapping/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';
import { ACTION_LABEL, STATUS_LABEL } from './labels';

/** Module 5 controls (client): rebuild, AI drafts, and per-row edits. */
export function MappingRunButtons({ domain, hasRows, aiAvailable }: { domain: string; hasRows: boolean; aiAvailable: boolean }) {
  const [built, rebuild] = useActionState<MappingState>(rebuildMappingAction.bind(null, domain), {});
  const [drafted, draft] = useActionState<MappingState>(writeDraftsAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <form action={rebuild}>
          <Submit label={hasRows ? 'Rebuild the plan' : 'Build the page plan'} busy="Mapping…" />
        </form>
        {hasRows && aiAvailable && (
          <form action={draft}>
            <Submit label="Write titles with AI" busy="Writing… (about 30 seconds)" tone="secondary" />
          </form>
        )}
      </div>
      <Message state={built} />
      <Message state={drafted} />
    </div>
  );
}


/** Status, saved as soon as it changes (5.13). */
export function StatusSelect({ domain, row }: { domain: string; row: MappingRow }) {
  const form = useRef<HTMLFormElement>(null);
  const [, action] = useActionState<MappingState, FormData>(updateMappingRowAction.bind(null, domain, row.clusterId), {});
  return (
    <form ref={form} action={action}>
      <label className="sr-only" htmlFor={`status-${row.clusterId}`}>Status of {row.topic}</label>
      <select id={`status-${row.clusterId}`} name="status" defaultValue={row.status} onChange={() => form.current?.requestSubmit()} className={SELECT_SM}>
        {Object.entries(STATUS_LABEL).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </form>
  );
}

const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

/** 5.2 page, 5.9 action, 5.12 owner and 5.8 drafts (approve per row). */
export function RowEditor({ domain, row, pages, audience }: { domain: string; row: MappingRow; pages: string[]; audience: 'team' | 'customer' }) {
  const [state, action] = useActionState<MappingState, FormData>(updateMappingRowAction.bind(null, domain, row.clusterId), {});
  const options = [...new Set([...(row.url ? [row.url] : []), ...pages])];
  const d = row.drafts;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Page for this topic
          <select name="url" defaultValue={row.url ?? '__new'} className={INPUT}>
            <option value="__new">New page needed</option>
            {options.map((u) => (
              <option key={u} value={u}>{path(u)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          What to do
          <select name="action" defaultValue={row.action} className={INPUT}>
            {Object.entries(ACTION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-[12px] border border-border p-4">
        <legend className="px-1 text-sm font-semibold">
          New title, heading and description {d?.source === 'ai' ? <span className="font-normal text-ink-3">(written by AI)</span> : <span className="font-normal text-ink-3">(template)</span>}
        </legend>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Title <span className="text-[12px] font-normal text-ink-3">{d?.title.length ?? 0} characters (aim for 50–60)</span>
          <input name="title" defaultValue={d?.title ?? ''} maxLength={120} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Main heading (H1)
          <input name="h1" defaultValue={d?.h1 ?? ''} maxLength={120} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Meta description <span className="text-[12px] font-normal text-ink-3">{d?.meta.length ?? 0} characters (aim for 140–160)</span>
          <textarea name="meta" defaultValue={d?.meta ?? ''} maxLength={320} rows={2} className={`${INPUT} py-2`} />
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" name="approved" defaultChecked={d?.approved} className="size-4 accent-primary" />
          Approved: ready to put live
        </label>
      </fieldset>
      {audience === 'team' && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:max-w-xs">
          Owner
          <input name="owner" defaultValue={row.owner ?? ''} placeholder="Who does this" maxLength={80} className={INPUT} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}
