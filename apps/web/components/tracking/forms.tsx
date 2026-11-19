'use client';

import { useActionState } from 'react';
import type { TrackingManual } from '@seo/core';
import { runTrackingAction, saveTrackingManualAction, type TrackingState } from '@/app/tracking/actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';

export function RunTracking({ domain, again }: { domain: string; again: boolean }) {
  const [state, action] = useActionState<TrackingState>(runTrackingAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      <form action={action}>
        <Submit label={again ? 'Check tracking again' : 'Check tracking'} busy="Checking… (about 20 seconds)" />
      </form>
      <Message state={state} />
    </div>
  );
}

/** 11.7 Lead quality: do leads turn into jobs? Filled in by a person. */
export function LeadQualityForm({ domain, manual }: { domain: string; manual: TrackingManual }) {
  const [state, action] = useActionState<TrackingState, FormData>(saveTrackingManualAction.bind(null, domain), {});
  const matched = manual.leadsMatched === true ? 'yes' : manual.leadsMatched === false ? 'no' : '';
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Are leads from the website matched to booked jobs?
        <select name="leadsMatched" defaultValue={matched} className={`${SELECT_SM} max-w-xs font-normal`}>
          <option value="">Not checked yet</option>
          <option value="yes">Yes, we know which leads became jobs</option>
          <option value="no">No, we only count leads</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Where leads are recorded (CRM or job software)
        <input name="crm" defaultValue={manual.crm} maxLength={120} placeholder="ServiceTitan, Jobber, a spreadsheet…" className={`${INPUT} min-h-10 max-w-md text-sm font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Notes
        <textarea name="notes" defaultValue={manual.notes} maxLength={2000} rows={3} placeholder="Share of leads that book, spam calls, wrong-area enquiries…" className={`${INPUT} py-2 text-sm font-normal`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}
