'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, MAX_SEARCHES } from '@seo/core';
import { addCompetitorAction, findCompetitorsAction, refreshStrengthAction, saveCompetitorSettingsAction, type CompetitorState } from '@/app/competitors/actions';
import { TagInput } from '@/components/signup/TagInput';

export const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
export const SELECT_SM = 'min-h-10 rounded-control border border-border-strong bg-surface px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';

export function Message({ state }: { state: CompetitorState }) {
  if (state.error) return <p role="alert" className="text-[13px] font-semibold text-fail-text">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-[13px] font-semibold text-pass-text">{state.ok}</p>;
  return null;
}

const SUBMIT_TONE = {
  primary: 'bg-primary font-bold text-primary-ink hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface font-semibold hover:border-ink-3',
  /** Outlined, for navy surfaces. */
  dark: 'border border-ink-3 bg-transparent font-semibold text-white hover:border-mist-3',
};

export function Submit({ label, busy, tone = 'primary' }: { label: string; busy: string; tone?: keyof typeof SUBMIT_TONE }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-11 items-center rounded-button px-5 text-sm disabled:opacity-60 ${SUBMIT_TONE[tone]}`}
    >
      {pending ? busy : label}
    </button>
  );
}

/** 3.3 settings: where and in which language to look, and the core searches. */
export function CompetitorSettings({ domain, country, language, searches }: { domain: string; country: string; language: string; searches: string[] }) {
  const [state, action] = useActionState<CompetitorState, FormData>(saveCompetitorSettingsAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Country
          <select name="country" defaultValue={country} className={INPUT}>
            {COMPETITOR_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Language
          <select name="language" defaultValue={language} className={INPUT}>
            {Object.entries(COMPETITOR_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <TagInput name="searches" label="Searches your customers type" hint={`Type a search and press Enter, the way a customer would, such as a service and a place. Up to ${MAX_SEARCHES}.`} placeholder="For example: plumber in leeds" initial={searches} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save searches" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

/** 3.2–3.4 run discovery and 3.8 refresh strength (team). */
export function RunButtons({ domain, canRefresh, hasRun }: { domain: string; canRefresh: boolean; hasRun: boolean }) {
  const [found, find] = useActionState<CompetitorState>(findCompetitorsAction.bind(null, domain), {});
  const [strength, refresh] = useActionState<CompetitorState>(refreshStrengthAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2.5">
        {canRefresh && (
          <form action={refresh}>
            <Submit label="Refresh visits and trend" busy="Measuring…" tone="secondary" />
          </form>
        )}
        <form action={find}>
          <Submit label={hasRun ? 'Check for new competitors now' : 'Find my competitors now'} busy="Searching Google… (about a minute)" tone={hasRun ? 'secondary' : 'primary'} />
        </form>
      </div>
      <Message state={found} />
      <Message state={strength} />
    </div>
  );
}

/** 3.1 add a competitor by hand, straight onto the shortlist. */
export function AddCompetitorForm({ domain }: { domain: string }) {
  const [state, action] = useActionState<CompetitorState, FormData>(addCompetitorAction.bind(null, domain), {});
  const field = 'flex flex-col gap-1.5 text-[13px] font-bold';
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className={`${field} min-w-[200px] flex-[2]`}>
        Website
        <input name="domain" placeholder="rival.com" className={`${INPUT} text-sm font-normal`} />
      </label>
      <label className={`${field} min-w-[180px] flex-[2]`}>
        <span>Business name <span className="font-normal text-ink-2">(optional)</span></span>
        <input name="name" className={`${INPUT} text-sm font-normal`} />
      </label>
      <label className={`${field} min-w-[150px] flex-1`}>
        Watch it as
        <select name="shortlist" defaultValue="direct" className={`${INPUT} text-sm font-normal`}>
          <option value="direct">Main competitor</option>
          <option value="aspirational">Bigger name to learn from</option>
        </select>
      </label>
      <Submit label="Add competitor" busy="Adding…" />
      <div className="w-full empty:hidden">
        <Message state={state} />
      </div>
    </form>
  );
}
