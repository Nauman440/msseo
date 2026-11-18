'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import type { MappingRow, PageFix } from '@seo/core';
import {
  addPageKeywordAction, confirmIntentAction, editFixAction, moveKeywordAction, recheckPageAction, sendFixesAction, updateMappingRowAction, type MappingState,
} from '@/app/mapping/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';
import { BUTTON_SECONDARY } from './forms';
import { ACTION_LABEL, STATUS_LABEL } from './labels';

/** Module 5 one-page keyword map controls (client). */
const LINK_BUTTON = 'min-h-7 px-1 text-[13px] font-semibold text-primary-heading underline underline-offset-[3px]';

/** "Move" a keyword to another topic. */
export function MoveKeyword({ domain, term, topics }: { domain: string; term: string; topics: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MappingState, FormData>(moveKeywordAction.bind(null, domain, term), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Move ${term} to another page`} className="min-h-9 whitespace-nowrap rounded-[8px] border border-border bg-surface px-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink-3">
        Move
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-1.5">
      <label className="sr-only" htmlFor={`move-${term}`}>Move {term} to</label>
      <select id={`move-${term}`} name="to" className={`${SELECT_SM} max-w-[180px]`} defaultValue="">
        <option value="" disabled>Move to…</option>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <Submit label="Move" busy="…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}

/** "+ Add keyword" */
export function AddKeyword({ domain, clusterId }: { domain: string; clusterId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MappingState, FormData>(addPageKeywordAction.bind(null, domain, clusterId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_SECONDARY}>
        + Add keyword
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        Keyword for this page
        <input name="term" required minLength={3} maxLength={80} className={`${INPUT} min-h-10 w-64 max-w-full text-sm font-normal`} placeholder="e.g. heat pump installers" />
      </label>
      <Submit label="Add" busy="Adding…" />
      <Message state={state} />
    </form>
  );
}

function FixEditor({ domain, clusterId, fix, onDone }: { domain: string; clusterId: string; fix: PageFix; onDone: () => void }) {
  const [state, action] = useActionState<MappingState, FormData>(editFixAction.bind(null, domain, clusterId, fix.id), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`edit-${fix.id}`}>{fix.label}</label>
      <textarea id={`edit-${fix.id}`} name="text" defaultValue={fix.suggested} rows={fix.suggested.length > 90 ? 4 : 2} maxLength={1200} className={`${INPUT} py-2 text-sm`} />
      <div className="flex flex-wrap items-center gap-2">
        <Submit label="Save" busy="Saving…" />
        <button type="button" onClick={onDone} className="min-h-10 px-2 text-sm font-semibold text-ink-2 underline">Done</button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** The drafted fixes with tick boxes, inline edit, and the navy "Send N fixes to approvals" bar. */
export function FixList({ domain, clusterId, fixes, keywords, nextHref }: {
  domain: string;
  clusterId: string;
  fixes: PageFix[];
  /** Each keyword of the map and whether it is already in place everywhere it should be. */
  keywords: { term: string; inPlace: boolean }[];
  nextHref: string | null;
}) {
  const signature = fixes.map((f) => f.id).join('|');
  const [seen, setSeen] = useState(signature);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(fixes.map((f) => f.id)));
  const [editing, setEditing] = useState<string | null>(null);
  // New or removed fixes (a keyword was added or moved): tick everything again.
  if (seen !== signature) {
    setSeen(signature);
    setPicked(new Set(fixes.map((f) => f.id)));
  }
  const [state, action] = useActionState<MappingState, FormData>(sendFixesAction.bind(null, domain, clusterId), {});
  const formId = `send-${clusterId}`;
  const covered = new Set(fixes.filter((f) => picked.has(f.id)).flatMap((f) => f.keywords));
  const after = keywords.filter((k) => k.inPlace || covered.has(k.term)).length;
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <>
      <section aria-labelledby="fixes-title" className="flex flex-col rounded-card border border-border bg-surface px-[22px] pb-1 pt-[22px]">
        <div className="pb-3.5">
          <h2 id="fixes-title" className="font-display text-xl font-bold">{fixes.length ? `${fixes.length} ${fixes.length === 1 ? 'fix' : 'fixes'} to close the gaps` : 'No fixes needed'}</h2>
          <p className="mt-1 text-sm text-ink-2">{fixes.length ? 'Each fix puts a missing keyword in its spot. Nothing changes until you approve.' : 'Every keyword is where it should be.'}</p>
        </div>
        {fixes.map((f) => (
          <div key={f.id} className="flex flex-col gap-2.5 border-t border-border py-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-bold">
                <input type="checkbox" name="fix" value={f.id} form={formId} checked={picked.has(f.id)} onChange={() => toggle(f.id)} className="size-5 accent-primary" />
                {f.label}
              </label>
              <span className="text-[12px] text-ink-2">{f.reason}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[12px] border border-border bg-canvas px-3.5 py-3">
                <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2">Now</p>
                <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-normal text-ink-2">{f.now}</p>
              </div>
              <div className="rounded-[12px] border border-teal-soft bg-teal-bg px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-teal-text">Suggested · {f.edited ? 'edited' : f.note}</p>
                  {editing !== f.id && (
                    <button type="button" onClick={() => setEditing(f.id)} className={LINK_BUTTON}>Edit</button>
                  )}
                </div>
                {editing === f.id ? (
                  <div className="mt-1.5">
                    <FixEditor domain={domain} clusterId={clusterId} fix={f} onDone={() => setEditing(null)} />
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-line break-words text-sm font-semibold leading-normal">{f.suggested}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>
      <form id={formId} action={action} className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3.5 rounded-card bg-night px-[18px] py-3.5">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] text-white">
            <strong>{picked.size} {picked.size === 1 ? 'fix' : 'fixes'} selected</strong>{' '}
            <span className="text-mist-3">· after approval, {after} of {keywords.length} keywords will be in place</span>
          </p>
          {(state.ok || state.error) && <p role={state.error ? 'alert' : 'status'} className={cn('text-[13px] font-semibold', state.error ? 'text-primary-tint' : 'text-tick')}>{state.error ?? state.ok}</p>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {nextHref && (
            <Link href={nextHref} className="inline-flex min-h-12 items-center rounded-button border border-ink-3 px-[18px] text-[15px] font-semibold text-white hover:border-mist-3">Next page</Link>
          )}
          {fixes.length > 0 && <SendButton count={picked.size} />}
        </div>
      </form>
    </>
  );
}

function SendButton({ count }: { count: number }) {
  return (
    <button type="submit" disabled={!count} className="inline-flex min-h-12 items-center rounded-button bg-primary px-[22px] text-[15px] font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-50">
      Send {count} {count === 1 ? 'fix' : 'fixes'} to approvals
    </button>
  );
}

/** "Send to approvals" for a new page's brief. */
export function SendBrief({ domain, clusterId, sent }: { domain: string; clusterId: string; sent: boolean }) {
  const [state, action] = useActionState<MappingState, FormData>(sendFixesAction.bind(null, domain, clusterId), {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="brief" value="1" />
      <Submit label={sent ? 'Send to approvals again' : 'Send to approvals'} busy="Sending…" />
      {(state.ok || state.error) && <p role={state.error ? 'alert' : 'status'} className={cn('text-[13px] font-semibold', state.error ? 'text-primary-tint' : 'text-tick')}>{state.error ?? state.ok}</p>}
    </form>
  );
}

export function RecheckButton({ domain, clusterId }: { domain: string; clusterId: string }) {
  const [state, action] = useActionState<MappingState>(recheckPageAction.bind(null, domain, clusterId), {});
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <button type="submit" className={LINK_BUTTON}>Check the page again</button>
      <Message state={state} />
    </form>
  );
}

export function ConfirmIntent({ domain, clusterId }: { domain: string; clusterId: string }) {
  const [state, action] = useActionState<MappingState>(confirmIntentAction.bind(null, domain, clusterId), {});
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <button type="submit" className={LINK_BUTTON}>Confirm</button>
      <Message state={state} />
    </form>
  );
}

/** Team only: 5.9 action, 5.12 owner and 5.13 status for one page. */
export function TeamControls({ domain, row }: { domain: string; row: MappingRow }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<MappingState, FormData>(updateMappingRowAction.bind(null, domain, row.clusterId), {});
  return (
    <form ref={form} action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        What to do
        <select name="action" defaultValue={row.action} className={SELECT_SM}>
          {Object.entries(ACTION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        Status
        <select name="status" defaultValue={row.status} className={SELECT_SM}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-bold">
        Owner
        <input name="owner" defaultValue={row.owner ?? ''} maxLength={80} placeholder="Who does this" className={`${SELECT_SM} w-44`} />
      </label>
      <Submit label="Save" busy="Saving…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}
