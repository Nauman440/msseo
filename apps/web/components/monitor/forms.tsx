'use client';

import { useActionState } from 'react';
import type { MonitorWorkspace } from '@seo/core';
import { resolveAlertAction, runMonitorAction, saveKeywordsAction, saveMeetingAction, setMonitoringAction, type MonitorState } from '@/app/monitor/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';

/** Module 13 controls (client). */
export function RunMonitor({ domain, enabled, customer }: { domain: string; enabled: boolean; customer: boolean }) {
  const [state, run] = useActionState<MonitorState>(runMonitorAction.bind(null, domain), {});
  const [toggled, toggle] = useActionState<MonitorState>(setMonitoringAction.bind(null, domain, !enabled), {});
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <form action={run}>
          <Submit label="Run checks now" busy="Checking… (up to a minute)" />
        </form>
        {!customer && (
          <form action={toggle}>
            <Submit label={enabled ? 'Turn monitoring off' : 'Turn monitoring on'} busy="Saving…" tone="secondary" />
          </form>
        )}
      </div>
      <Message state={state.ok || state.error ? state : toggled} />
    </div>
  );
}

export function ResolveAlert({ domain, id }: { domain: string; id: string }) {
  const [, action] = useActionState<MonitorState>(resolveAlertAction.bind(null, domain, id), {});
  return (
    <form action={action} className="print:hidden">
      <button type="submit" className="min-h-10 whitespace-nowrap rounded-[8px] border border-border bg-surface px-3 text-[13px] font-semibold text-ink-2 hover:border-ink-3">Mark as handled</button>
    </form>
  );
}

export function KeywordsForm({ domain, keywords, custom }: { domain: string; keywords: string[]; custom: boolean }) {
  const [state, action] = useActionState<MonitorState, FormData>(saveKeywordsAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Searches to track (one per line, up to 20)
        <textarea name="keywords" defaultValue={keywords.join('\n')} rows={6} className={`${INPUT} py-2 text-sm font-normal`} />
      </label>
      <p className="text-[12.5px] text-ink-2">{custom ? 'Picked by hand. Empty the box to go back to the top topics from Keywords.' : 'Picked from the top topics in Keywords. Edit to choose your own.'} Each check costs about $0.002 a week.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save searches" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

export function MeetingForm({ domain, meeting }: { domain: string; meeting: MonitorWorkspace['meeting'] }) {
  const [state, action] = useActionState<MonitorState, FormData>(saveMeetingAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          How often
          <select name="cadence" defaultValue={meeting.cadence} className={`${SELECT_SM} font-normal`}>
            <option value="none">No regular meeting</option>
            <option value="weekly">Every week</option>
            <option value="fortnightly">Every two weeks</option>
            <option value="monthly">Every month</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Next meeting
          <input type="date" name="next" defaultValue={meeting.next ?? ''} className={`${INPUT} min-h-10 text-sm font-normal`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Agenda and notes
        <textarea name="notes" defaultValue={meeting.notes} rows={3} maxLength={2000} className={`${INPUT} py-2 text-sm font-normal`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save meeting" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex print:hidden min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">
      Print or save as PDF
    </button>
  );
}
