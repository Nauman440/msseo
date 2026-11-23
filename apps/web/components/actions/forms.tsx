'use client';

import { useActionState, useRef } from 'react';
import type { ActionItem } from '@seo/core';
import { addActionsAction, approveActionAction, rewriteAiPlanAction, updateActionAction, type ActionState } from '@/app/action-plan/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';
import { ACTION_STATUS_LABEL, APPROVAL_LABEL, BUCKET_LABEL } from './labels';

/** 12.2 Add the top 10 suggestions, or one (`suggestionKey`). */
export function AddActions({ domain, suggestionKey = null, label, tone = 'primary' }: { domain: string; suggestionKey?: string | null; label: string; tone?: 'primary' | 'secondary' }) {
  const [state, action] = useActionState<ActionState>(addActionsAction.bind(null, domain, suggestionKey), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label={label} busy="Adding…" tone={tone} />
      <Message state={state} />
    </form>
  );
}

/** Writes the 6-month plan with AI (or again). Takes up to a few minutes. */
export function RewritePlanButton({ domain, label, disabledReason = null }: { domain: string; label: string; disabledReason?: string | null }) {
  const [state, action] = useActionState<ActionState>(rewriteAiPlanAction.bind(null, domain), {});
  if (disabledReason) return <p className="text-[13px] text-ink-2">{disabledReason}</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label={label} busy="Writing your plan… (up to 3 minutes)" tone="secondary" />
      <Message state={state} />
    </form>
  );
}

/** Status, saved as soon as it changes. Done starts the 7/14/28-day checks. */
export function ActionStatusSelect({ domain, action: a }: { domain: string; action: ActionItem }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<ActionState, FormData>(updateActionAction.bind(null, domain, a.id), {});
  const options = a.status === 'verified' ? (['verified', 'todo', 'in_progress'] as const) : (['todo', 'in_progress', 'done', 'dismissed'] as const);
  return (
    <form ref={form} action={action} className="flex flex-col items-start gap-1">
      <label className="sr-only" htmlFor={`status-${a.id}`}>Status of {a.title}</label>
      <select id={`status-${a.id}`} name="status" defaultValue={a.status} onChange={() => form.current?.requestSubmit()} className={SELECT_SM}>
        {options.map((v) => (
          <option key={v} value={v}>{ACTION_STATUS_LABEL[v]}</option>
        ))}
      </select>
      <Message state={state} />
    </form>
  );
}

export function ApproveButton({ domain, id, label = 'Approve' }: { domain: string; id: string; label?: string }) {
  const [state, action] = useActionState<ActionState>(approveActionAction.bind(null, domain, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label={label} busy="Approving…" />
      <Message state={state} />
    </form>
  );
}

/** 12.4 Team: title, owner, due date, approval level and roadmap month. */
export function ActionEditor({ domain, action: a }: { domain: string; action: ActionItem }) {
  const [state, action] = useActionState<ActionState, FormData>(updateActionAction.bind(null, domain, a.id), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Title (plain language, the client sees it)
        <input name="title" defaultValue={a.title} maxLength={160} className={INPUT} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Owner
          <input name="owner" defaultValue={a.owner ?? ''} placeholder="Who does this" maxLength={80} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Due date
          <input type="date" name="dueDate" defaultValue={a.dueDate ?? ''} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Approval
          <select name="approval" defaultValue={a.approval} className={INPUT}>
            {Object.entries(APPROVAL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Roadmap
          <select name="bucket" defaultValue={a.bucket} className={INPUT}>
            {Object.entries(BUCKET_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}
