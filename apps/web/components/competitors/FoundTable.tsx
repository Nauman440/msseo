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
  { value: 'seen', label: 'Seen most often' },
  { value: 'position', label: 'Best position' },
  { value: 'visits', label: 'Most visits' },
  { value: 'keywords', label: 'Most keywords' },
];
const TH = 'whitespace-nowrap px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-3 align-middle';
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

/** "Competitors we found" (design): filter chips, sort, seen-in dots, trend and shortlist buttons. */
export function FoundTable({ domain, rivals, searches }: { domain: string; rivals: CompetitorRecord[]; searches: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('seen');
  const chips: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'map', label: 'Map pack' },
    { value: 'results', label: 'Search results' },
    { value: 'shortlisted', label: 'Shortlisted' },
    { value: 'unreviewed', label: 'Not reviewed' },
  ];
  const rows = rivals.filter(MATCH[filter]).sort(ORDER[sort]);
  return (
    <section aria-labelledby="found-title" className="flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="found-title" className="font-display text-xl font-bold">Competitors we found</h2>
          <p className="mt-1 text-sm text-ink-2">{sort === 'seen' ? 'Sorted by how often they show up for your searches.' : `Sorted by ${SORTS.find((s) => s.value === sort)!.label.toLowerCase()}.`}</p>
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
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
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
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr>
              <th className={TH}>Competitor</th>
              <th className={TH}>Seen in searches</th>
              <th className={cn(TH, 'text-right')}>Avg. position</th>
              <th className={cn(TH, 'text-right')}>Visits / mo</th>
              <th className={cn(TH, 'text-right')}>Keywords</th>
              <th className={TH}>12 months</th>
              <th className={TH}>Shortlist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const where = whereSeen(c);
              return (
                <tr key={c.domain}>
                  <td className={cn(TD, 'min-w-[200px]')}>
                    <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-primary-text hover:underline">{c.domain}</a>
                    {c.isNew && <span className="ml-2 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-primary-ink">New</span>}
                    {c.name && <p className="mt-0.5 text-[12px] text-ink-2">{c.name}</p>}
                    {where && <p className="mt-1.5"><span className={cn(CHIP, where === 'Map pack' ? 'bg-indigo-bg text-indigo-text' : 'bg-sunken text-ink-2')}>{where}</span></p>}
                  </td>
                  <td className={TD}>
                    {searches ? (
                      <div role="img" aria-label={`Seen in ${c.seenIn} of ${searches} searches`} className="flex items-center gap-[3px]">
                        {Array.from({ length: Math.min(searches, 15) }, (_, i) => (
                          <span key={i} className={cn('size-2 rounded-[2px]', i < c.seenIn ? 'bg-teal' : 'bg-border')} />
                        ))}
                        <span className="ml-1.5 text-[12px] text-ink-2 tabular">{c.seenIn}/{searches}</span>
                      </div>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className={cn(TD, 'text-right font-bold tabular')}>{c.avgPosition == null ? '–' : c.avgPosition.toFixed(1)}</td>
                  <td className={cn(TD, 'text-right tabular')}>{n(c.etv)}</td>
                  <td className={cn(TD, 'text-right tabular')}>{n(c.keywords)}</td>
                  <td className={TD}><Sparkline points={c.trend} label={c.domain} /></td>
                  <td className={TD}>
                    <ShortlistButtons key={`${c.shortlist}|${c.rejected}`} domain={domain} competitor={c.domain} value={c.shortlist !== 'none' ? c.shortlist : c.rejected ? 'rejected' : null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="px-2.5 py-6 text-sm text-ink-2">Nothing here.</p>}
      </div>
    </section>
  );
}
