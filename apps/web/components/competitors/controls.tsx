'use client';

import { useState, useTransition } from 'react';
import type { ListingStatus } from '@seo/core';
import { moveToCompetitorsAction, setListingAction, setShortlistAction, type CompetitorState } from '@/app/competitors/actions';
import { cn } from '@/lib/tones';
import { Message } from './forms';

type Choice = 'direct' | 'aspirational' | 'rejected';
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'direct', label: 'Main competitor' },
  { value: 'aspirational', label: 'Bigger name' },
  { value: 'rejected', label: 'Not a competitor' },
];

/** Shortlist buttons (design): pressing the chosen one again sets it back to "not reviewed". */
export function ShortlistButtons({ domain, competitor, value }: { domain: string; competitor: string; value: Choice | null }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [state, setState] = useState<CompetitorState>({});
  const pick = (c: Choice) =>
    start(async () => {
      const next = current === c ? null : c;
      setCurrent(next);
      const r = await setShortlistAction(domain, competitor, next ?? 'none');
      if (r.error) setState(r);
    });
  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label={`Shortlist ${competitor}`} className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={current === c.value}
            disabled={pending}
            onClick={() => pick(c.value)}
            className={cn(
              'min-h-9 whitespace-nowrap rounded-[8px] border px-2.5 text-[12.5px] font-bold disabled:opacity-70',
              current === c.value ? (c.value === 'aspirational' ? 'border-transparent bg-night text-white' : c.value === 'rejected' ? 'border-transparent bg-sunken text-ink' : 'border-transparent bg-primary text-primary-ink') : 'border-border-strong bg-surface text-ink hover:border-ink-3',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <Message state={state} />
    </div>
  );
}

/** The × on a shortlist chip. */
export function RemoveFromShortlist({ domain, competitor, light }: { domain: string; competitor: string; light?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${competitor} from shortlist`}
      onClick={() => start(async () => void (await setShortlistAction(domain, competitor, 'none')))}
      className={cn('flex size-[26px] items-center justify-center rounded-full disabled:opacity-60', light ? 'hover:bg-white/15' : 'hover:bg-black/10')}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
        <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const STATUS_BUTTONS: { value: ListingStatus; label: string }[] = [
  { value: 'listed', label: 'Listed' },
  { value: 'not_listed', label: 'Not listed yet' },
  { value: 'wrong', label: 'Details wrong' },
  { value: 'irrelevant', label: 'Not relevant' },
];

/** Listing status buttons for one directory or publisher (set by hand until Module 9 checks it). */
export function ListingButtons({ domain, site, status }: { domain: string; site: string; status: ListingStatus }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<CompetitorState>({});
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] text-ink-2">Mark as:</span>
        {STATUS_BUTTONS.filter((b) => b.value !== status).map((b) => (
          <button
            key={b.value}
            type="button"
            disabled={pending}
            onClick={() => start(async () => setState(await setListingAction(domain, site, b.value)))}
            aria-label={`Mark ${site} as ${b.label.toLowerCase()}`}
            className="min-h-11 px-1 text-sm font-semibold text-primary-heading underline underline-offset-[3px] disabled:opacity-60"
          >
            {b.label}
          </button>
        ))}
      </div>
      {state.error && <Message state={state} />}
    </div>
  );
}

export function MoveToCompetitors({ domain, site }: { domain: string; site: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Move ${site} to competitors`}
      onClick={() => start(async () => void (await moveToCompetitorsAction(domain, site)))}
      className="min-h-9 rounded-full border border-border-strong bg-surface px-3 text-[12px] font-semibold hover:border-ink-3 disabled:opacity-60"
    >
      Move to competitors
    </button>
  );
}
