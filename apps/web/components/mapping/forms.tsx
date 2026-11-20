'use client';

import { useActionState, useState, type ReactNode } from 'react';
import type { MappingRow } from '@seo/core';
import { choosePageAction, rebuildMappingAction, sendAllFixesAction, settleConflictAction, writeDraftsAction, type MappingState } from '@/app/mapping/actions';
import { INPUT, Message, Submit } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';
import { CHIP, MONO } from './labels';

/** Module 5 overview controls (client): rebuild, AI drafts, conflicts, choosing a page, sending fixes. */
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
export const BUTTON = 'inline-flex min-h-10 items-center rounded-button px-5 text-[15px]';
export const BUTTON_SECONDARY = `${BUTTON} border border-border-strong bg-surface font-semibold hover:border-ink-3`;
export const BUTTON_PRIMARY = `${BUTTON} bg-primary font-bold text-primary-ink hover:bg-primary-hover`;

export function MappingRunButtons({ domain, hasRows, aiAvailable, csvHref }: { domain: string; hasRows: boolean; aiAvailable: boolean; csvHref: string | null }) {
  const [built, rebuild] = useActionState<MappingState>(rebuildMappingAction.bind(null, domain), {});
  const [drafted, draft] = useActionState<MappingState>(writeDraftsAction.bind(null, domain), {});
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2.5">
        {hasRows && aiAvailable && (
          <form action={draft}>
            <Submit label="Write titles with AI" busy="Writing… (about 30 seconds)" tone="secondary" />
          </form>
        )}
        {csvHref && (
          <a href={csvHref} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">
            Download CSV
          </a>
        )}
        <form action={rebuild}>
          <Submit label={hasRows ? 'Match pages again' : 'Match pages to topics'} busy="Matching…" />
        </form>
      </div>
      <Message state={built} />
      <Message state={drafted} />
    </div>
  );
}

/** 5.4 "Which page should be the main one?" Radio per page, what happens to the other page, confirm. */
/** inline: inside a settled topic ("Change"), without the topic side, arrow and chip. */
export function ConflictForm({ domain, row, left, positions, inline = false }: { domain: string; row: MappingRow; left: ReactNode; positions: Record<string, number | null>; inline?: boolean }) {
  const [state, action] = useActionState<MappingState, FormData>(settleConflictAction.bind(null, domain, row.clusterId), {});
  const options = [row.url!, ...row.conflicts.map((c) => c.url)];
  const [main, setMain] = useState(row.url!);
  const share = (u: string) => row.conflicts.find((c) => c.url === u)?.share;
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-4">
        {!inline && left}
        {!inline && <Arrow />}
        <fieldset className="flex min-w-[min(260px,100%)] flex-[1.2] flex-col gap-2">
          <legend className="mb-2 text-[12.5px] font-bold">Which page should be the main one?</legend>
          {options.map((u, i) => {
            const on = main === u;
            const pos = positions[u];
            const s = share(u);
            return (
              <label key={u} className={cn('flex cursor-pointer items-start gap-2.5 rounded-control px-3 py-2.5', on ? 'border-2 border-primary bg-primary-wash' : 'border border-border bg-surface')}>
                <input type="radio" name="main" value={u} checked={on} onChange={() => setMain(u)} className="mt-0.5 size-[18px] shrink-0 accent-primary" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={MONO}>{path(u)}</span>
                  <span className="text-[12px] text-ink-2">
                    {i === 0 ? 'Recommended: stronger page' : 'Other page'}
                    {pos !== undefined && pos !== null ? ` · ranks #${Math.round(pos)}` : ''}
                    {s !== undefined && s > 0 ? ` · ${Math.round(s * 100)}% of the clicks` : ''}
                  </span>
                </span>
              </label>
            );
          })}
          <label className="mt-1 flex flex-col gap-1 text-[12.5px] font-bold">
            The other page
            <select name="plan" defaultValue="differentiate" className={`${INPUT} min-h-10 text-sm font-normal`}>
              <option value="differentiate">Give it another keyword (best)</option>
              <option value="merge">Merge and redirect it</option>
            </select>
          </label>
        </fieldset>
        {!inline && <span className={`${CHIP} bg-high-bg text-high-strong`}>Two pages compete</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3">
        <p className="max-w-[520px] text-[13px] leading-snug text-ink-2">Google splits clicks between both pages. Merging or redirecting always needs your approval.</p>
        <div className="flex flex-col items-end gap-1">
          <Submit label="Confirm main page" busy="Saving…" />
          <Message state={state} />
        </div>
      </div>
    </form>
  );
}

export function Arrow() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" className="hidden shrink-0 sm:block">
      <path d="M2 10h22M18 4l6 6-6 6" fill="none" className="stroke-chart-neutral" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Use an existing page" / "Change page": a page picker that opens in place. */
export function PageChooser({ domain, row, pages, label }: { domain: string; row: MappingRow; pages: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MappingState, FormData>(choosePageAction.bind(null, domain, row.clusterId), {});
  const options = [...new Set([...(row.url ? [row.url] : []), ...pages])];
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_SECONDARY} aria-expanded={false}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12.5px] font-bold sm:w-72 sm:flex-none">
        Page for “{row.topic}”
        <select name="url" defaultValue={row.url ?? '__new'} className={`${INPUT} min-h-10 text-sm font-normal`}>
          <option value="__new">New page needed</option>
          {options.map((u) => (
            <option key={u} value={u}>{path(u)}</option>
          ))}
        </select>
      </label>
      <Submit label="Save" busy="Saving…" />
      <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-2 text-sm font-semibold text-ink-2 underline">Cancel</button>
      <Message state={state} />
    </form>
  );
}

/** The navy bar at the bottom of the overview. */
export function SendAllBar({ domain, conflicts, fixes }: { domain: string; conflicts: number; fixes: number }) {
  const [state, action] = useActionState<MappingState>(sendAllFixesAction.bind(null, domain), {});
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3.5 rounded-card bg-night px-[18px] py-3.5">
      <p className="text-[15px] text-white">
        {conflicts > 0 && <strong>{conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'} to settle · </strong>}
        <span className="text-mist-3">{fixes} {fixes === 1 ? 'fix' : 'fixes'} drafted so far</span>
      </p>
      <form action={action} className="flex flex-col items-end gap-1">
        <Submit label="Send fixes to approvals" busy="Sending… (checks each page)" />
        {(state.ok || state.error) && <p role={state.error ? 'alert' : 'status'} className={cn('text-[13px] font-semibold', state.error ? 'text-primary-tint' : 'text-tick')}>{state.error ?? state.ok}</p>}
      </form>
    </div>
  );
}
