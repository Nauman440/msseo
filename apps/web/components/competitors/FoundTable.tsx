'use client';

import { useState } from 'react';
import type { CompetitorRecord } from '@seo/core';
import { INPUT } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';
import { ShortlistButtons } from './controls';
import { CHIP, whereSeen } from './labels';
import { Sparkline } from './Sparkline';

type Filter = 'all' | 'map' | 'results' | 'shortlisted' | 'unreviewed';
type Sort = 'seen' | 'position' | 'visits' | 'keywords';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'seen', label: 'Shows up most' },
  { value: 'position', label: 'Highest on Google' },
  { value: 'visits', label: 'Most visits' },
  { value: 'keywords', label: 'Most searches' },
];
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Math.round(v).toLocaleString('en-US'));

const MATCH: Record<Filter, (c: CompetitorRecord) => boolean> = {
  all: () => true,
  map: (c) => c.sources.includes('local'),
  results: (c) => !c.sources.includes('local'),
  shortlisted: (c) => c.shortlist !== 'none',
  unreviewed: (c) => c.shortlist === 'none' && !c.rejected,
};
const ORDER: Record<Sort, (a: CompetitorRecord, b: CompetitorRecord) => number> = {
  seen: (a, b) => b.seenIn - a.seenIn || (a.avgPosition ?? 99) - (b.avgPosition ?? 99),
  position: (a, b) => (a.avgPosition ?? 99) - (b.avgPosition ?? 99),
  visits: (a, b) => (b.etv ?? -1) - (a.etv ?? -1),
  keywords: (a, b) => (b.keywords ?? -1) - (a.keywords ?? -1),
};
const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unreviewed', label: 'Not checked yet' },
  { value: 'shortlisted', label: 'Watched' },
  { value: 'map', label: 'In the map' },
  { value: 'results', label: 'In search results only' },
];
const COLS = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_150px_90px_110px_100px_96px] lg:items-center lg:gap-3';
const HEAD = 'text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const LABEL = 'text-[12px] text-ink-2 lg:hidden';

/**
 * Every business we found for the searches: what they are, how often they show up, and three buttons
 * to say what each one is to you. A list on phones, a table on wide screens.
 */
export function FoundTable({ domain, rivals, searches }: { domain: string; rivals: CompetitorRecord[]; searches: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('seen');
  const rows = rivals.filter(MATCH[filter]).sort(ORDER[sort]);
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const on = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.value)}
                className={cn('min-h-10 rounded-full border px-3.5 text-[13px] font-semibold', on ? 'border-night bg-night text-white' : 'border-border-strong bg-surface text-ink hover:border-ink-3')}
              >
                {c.label} <span className="tabular">{rivals.filter(MATCH[c.value]).length}</span>
              </button>
            );
          })}
        </div>
        <label className="flex min-w-[190px] flex-col gap-1 text-[12px] font-bold text-ink-2">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${INPUT} text-sm text-ink`}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={cn('hidden border-b border-border px-1 pb-2', COLS)} aria-hidden>
        <span className={HEAD}>Business</span>
        <span className={HEAD}>Shows up in</span>
        <span className={cn(HEAD, 'text-right')}>Usual spot</span>
        <span className={cn(HEAD, 'text-right')}>Visits a month</span>
        <span className={HEAD}>Last 12 months</span>
        <span className={cn(HEAD, 'text-right')}>Searches</span>
      </div>
      <ul className="flex flex-col">
        {rows.map((c) => {
          const where = whereSeen(c);
          return (
            <li key={c.domain} className="flex flex-col gap-3 border-b border-border px-1 py-4 last:border-b-0">
              <div className={cn('flex flex-col gap-2.5', COLS)}>
                <div className="min-w-0">
                  <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="break-words font-bold hover:text-primary-text hover:underline">{c.domain}</a>
                  {c.isNew && <span className="ml-2 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-primary-ink">New</span>}
                  {c.name && <p className="mt-0.5 text-[12px] text-ink-2">{c.name}</p>}
                  {where && <p className="mt-1.5"><span className={cn(CHIP, where === 'Map pack' ? 'bg-indigo-bg text-indigo-text' : 'bg-sunken text-ink-2')}>{where === 'Map pack' ? 'In the map' : 'In search results'}</span></p>}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:contents">
                  <div>
                    <span className={LABEL}>Shows up in </span>
                    {searches ? (
                      <span role="img" aria-label={`Shows up in ${c.seenIn} of ${searches} searches`} className="inline-flex items-center gap-[3px] align-middle">
                        {Array.from({ length: Math.min(searches, 15) }, (_, i) => (
                          <span key={i} className={cn('size-2 rounded-[2px]', i < c.seenIn ? 'bg-teal' : 'bg-border')} />
                        ))}
                        <span className="ml-1.5 text-[12px] text-ink-2 tabular">{c.seenIn}/{searches}</span>
                      </span>
                    ) : (
                      '–'
                    )}
                  </div>
                  <div className="lg:text-right"><span className={LABEL}>Usual spot </span><span className="font-bold tabular">{c.avgPosition == null ? '–' : `#${c.avgPosition.toFixed(1)}`}</span></div>
                  <div className="lg:text-right"><span className={LABEL}>Visits a month </span><span className="tabular">{n(c.etv)}</span></div>
                  <div className="hidden lg:block"><Sparkline points={c.trend} label={c.domain} /></div>
                  <div className="lg:text-right"><span className={LABEL}>Searches </span><span className="tabular">{n(c.keywords)}</span></div>
                </div>
              </div>
              <ShortlistButtons key={`${c.shortlist}|${c.rejected}`} domain={domain} competitor={c.domain} value={c.shortlist !== 'none' ? c.shortlist : c.rejected ? 'rejected' : null} />
            </li>
          );
        })}
      </ul>
      {!rows.length && <p className="px-1 py-6 text-sm text-ink-2">Nothing here.</p>}
    </div>
  );
}
