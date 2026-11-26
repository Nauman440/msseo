'use client';

import { useActionState } from 'react';
import type { AutopilotSettings } from '@seo/core';
import { approveWorkItemsAction, pauseAutopilotAction, resetAutopilotAction, runNextTaskAction, saveAutopilotSettingsAction, startImplementingAction, undoWorkItemAction, type AutopilotActionState } from '@/app/autopilot/actions';
import { Message, Submit } from '@/components/competitors/forms';

export function StartImplementingButton({ domain, label }: { domain: string; label: string }) {
  const [state, action] = useActionState<AutopilotActionState>(startImplementingAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Submit label={label} busy="Starting…" />
      <Message state={state} />
    </form>
  );
}

export function UndoItemButton({ domain, id }: { domain: string; id: string }) {
  const [state, action] = useActionState<AutopilotActionState>(undoWorkItemAction.bind(null, domain, id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Submit label="Undo" busy="Undoing…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}

export function ApproveButton({ domain, ids, label }: { domain: string; ids: string[] | 'all'; label: string }) {
  const [state, action] = useActionState<AutopilotActionState>(approveWorkItemsAction.bind(null, domain, ids), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Submit label={label} busy="Approving…" tone={ids === 'all' ? 'primary' : 'secondary'} />
      <Message state={state} />
    </form>
  );
}

const FIELD = 'flex flex-col gap-1 text-sm font-semibold';
const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export function AutopilotSettingsForm({ domain, settings: s, zones }: { domain: string; settings: AutopilotSettings; zones: string[] }) {
  const [state, action] = useActionState<AutopilotActionState, FormData>(saveAutopilotSettingsAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="mt-1 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-semibold">Run by itself, Monday to Friday</span>
          <span className="block text-[13px] text-ink-2">This month’s changes are spread over the working days left. Off: changes go out only when someone presses the button.</span>
        </span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Before a change goes live</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="auto" defaultChecked={s.mode === 'auto'} className="accent-primary" /> Make it straight away (every change can be undone)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="approve" defaultChecked={s.mode === 'approve'} className="accent-primary" /> Wait for my approval first</label>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={FIELD}>
          Time zone
          <select name="timezone" defaultValue={s.timezone} className={INPUT}>
            {[...new Set([s.timezone, ...zones])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className={FIELD}>
          Run time
          <select name="runHour" defaultValue={String(s.runHour)} className={INPUT}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
          </select>
        </label>
        <label className={FIELD}>
          Most changes a day
          <input name="dailyCap" type="number" min={1} max={30} defaultValue={s.dailyCap} className={`${INPUT} tabular`} />
        </label>
      </div>
      <label className={FIELD}>
        Pages to leave alone (one address per line; * matches anything)
        <textarea name="holdList" rows={3} defaultValue={s.holdList.join('\n')} placeholder={'/checkout/\n/landing-page-for-ads/\n/blog/*'} className={`${INPUT} py-2`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

export function StartOverForm({ domain }: { domain: string }) {
  const [state, action] = useActionState<AutopilotActionState, FormData>(resetAutopilotAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">Undoes every change the autopilot made on the website and forgets this month’s runs, so the next run starts from the beginning. The schedule settings stay.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" className="size-4 accent-primary" /> Yes, undo everything and start over
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Start over" busy="Undoing…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

export function RunNextTaskButton({ domain }: { domain: string }) {
  const [state, action] = useActionState<AutopilotActionState>(runNextTaskAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Submit label="Run next task now" busy="Starting…" tone="secondary" />
      <Message state={state} />
    </form>
  );
}

export function PauseButton({ domain, paused }: { domain: string; paused: boolean }) {
  const [state, action] = useActionState<AutopilotActionState>(pauseAutopilotAction.bind(null, domain, !paused), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Submit label={paused ? 'Resume' : 'Pause'} busy={paused ? 'Resuming…' : 'Pausing…'} tone="secondary" />
      <Message state={state} />
    </form>
  );
}
