'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, MAX_SEARCHES, type CompetitorType, type Shortlist } from '@seo/core';
import {
  addCompetitorAction, findCompetitorsAction, refreshStrengthAction, removeCompetitorAction, saveCompetitorSettingsAction, updateCompetitorAction, type CompetitorState,
} from '@/app/competitors/actions';
import { TagInput } from '@/components/signup/TagInput';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
const SELECT_SM = 'min-h-10 rounded-control border border-border-strong bg-surface px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';

function Message({ state }: { state: CompetitorState }) {
  if (state.error) return <p role="alert" className="text-[13px] font-semibold text-fail-text">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-[13px] font-semibold text-pass-text">{state.ok}</p>;
  return null;
}

function Submit({ label, busy, tone = 'primary' }: { label: string; busy: string; tone?: 'primary' | 'secondary' }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={tone === 'primary'
        ? 'inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-60'
        : 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3 disabled:opacity-60'}
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
      <TagInput name="searches" label="Searches your customers type" hint={`Type a search and press Enter, e.g. "ac repair dallas". Up to ${MAX_SEARCHES}.`} placeholder="For example: ac repair dallas" initial={searches} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save searches" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

/** 3.2–3.4 run discovery, 3.8 refresh strength. */
export function RunButtons({ domain, canRefresh }: { domain: string; canRefresh: boolean }) {
  const [found, find] = useActionState<CompetitorState>(findCompetitorsAction.bind(null, domain), {});
  const [strength, refresh] = useActionState<CompetitorState>(refreshStrengthAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <form action={find}>
          <Submit label="Find competitors" busy="Searching… (about a minute)" />
        </form>
        {canRefresh && (
          <form action={refresh}>
            <Submit label="Refresh strength" busy="Measuring…" tone="secondary" />
          </form>
        )}
      </div>
      <Message state={found} />
      <Message state={strength} />
    </div>
  );
}

const TYPE_LABEL: Record<CompetitorType, string> = { direct: 'Direct', local: 'Local (map)', search: 'Search only', directory: 'Directory', publisher: 'Publisher' };
const SHORT_LABEL: Record<Shortlist, string> = { none: 'Not shortlisted', direct: 'Direct shortlist', aspirational: 'Aspirational' };

/** 3.5 type override and 3.6 shortlist, saved as soon as a value changes. */
export function CompetitorControls({ domain, competitor, type, shortlist, layout = 'table' }: { domain: string; competitor: string; type: CompetitorType; shortlist: Shortlist; layout?: 'table' | 'card' }) {
  const id = `${layout}-${competitor}`;
  const form = useRef<HTMLFormElement>(null);
  const [, action] = useActionState<CompetitorState, FormData>(updateCompetitorAction.bind(null, domain, competitor), {});
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`type-${id}`}>Type of {competitor}</label>
      <select id={`type-${id}`} name="type" defaultValue={type} onChange={() => form.current?.requestSubmit()} className={SELECT_SM}>
        {Object.entries(TYPE_LABEL).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`short-${id}`}>Shortlist {competitor}</label>
      <select id={`short-${id}`} name="shortlist" defaultValue={shortlist} onChange={() => form.current?.requestSubmit()} className={SELECT_SM}>
        {Object.entries(SHORT_LABEL).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <button type="submit" formAction={removeCompetitorAction.bind(null, domain, competitor)} aria-label={`Remove ${competitor}`} className="min-h-10 rounded-control px-2 text-sm text-ink-3 hover:text-fail-text">
        Remove
      </button>
    </form>
  );
}

/** 3.1 add a competitor by hand. */
export function AddCompetitorForm({ domain }: { domain: string }) {
  const [state, action] = useActionState<CompetitorState, FormData>(addCompetitorAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Website
          <input name="domain" placeholder="rival.com" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Name <span className="sr-only">(optional)</span>
          <input name="name" placeholder="Optional" className={INPUT} />
        </label>
        <div className="flex items-end">
          <Submit label="Add competitor" busy="Adding…" tone="secondary" />
        </div>
      </div>
      <Message state={state} />
    </form>
  );
}
