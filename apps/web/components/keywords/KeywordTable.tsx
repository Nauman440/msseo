'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { KeywordRow, KeywordSort } from '@seo/core';
import { setKeywordStatusAction } from '@/app/keywords/actions';
import { INPUT, SELECT_SM } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';

const COLUMNS: { key: KeywordSort; label: string }[] = [
  { key: 'term', label: 'Keyword' },
  { key: 'volume', label: 'Searches / mo' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'cpc', label: 'CPC' },
  { key: 'position', label: 'Your position' },
];
const fmt = (v: number | null) => (v === null ? '–' : v.toLocaleString('en-US'));
type Filters = { q: string; show: 'kept' | 'removed' | 'all'; intent: string; from: string; sort: KeywordSort; desc: boolean };
const DEFAULTS: Filters = { q: '', show: 'kept', intent: '', from: '', sort: 'volume', desc: true };

/**
 * Sortable, filterable keyword list with keep/remove per row (4.4 manual override). The server
 * sends one page at a time (`/api/keywords/<domain>`); the first page comes with the HTML.
 */
export function KeywordTable({ domain, initial }: { domain: string; initial: { rows: KeywordRow[]; total: number } }) {
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const request = useRef(0);

  const load = useCallback(
    async (f: Filters, offset: number, append: boolean) => {
      const id = ++request.current;
      setLoading(true);
      const qs = new URLSearchParams({ q: f.q, show: f.show, intent: f.intent, from: f.from, sort: f.sort, desc: f.desc ? '1' : '0', offset: String(offset) });
      try {
        const res = await fetch(`/api/keywords/${domain}?${qs}`, { cache: 'no-store' });
        if (!res.ok || id !== request.current) return;
        const page = (await res.json()) as { rows: KeywordRow[]; total: number };
        setData((d) => ({ total: page.total, rows: append ? [...d.rows, ...page.rows] : page.rows }));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [domain],
  );

  // Filters and sorting reload the first page (typing waits a moment).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void load(filters, 0, false), filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key: KeywordSort) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === 'volume' || key === 'cpc' });
  const flip = (r: KeywordRow) =>
    startTransition(async () => {
      await setKeywordStatusAction(domain, r.term, r.status === 'kept' ? 'removed' : 'kept');
      await load(filters, 0, false);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Search the list
          <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Keyword or cluster" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Show
          <select value={filters.show} onChange={(e) => set({ show: e.target.value as Filters['show'] })} className={INPUT}>
            <option value="kept">Kept</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Intent
          <select value={filters.intent} onChange={(e) => set({ intent: e.target.value })} className={INPUT}>
            <option value="">Any</option>
            <option value="transactional">Ready to buy</option>
            <option value="commercial">Comparing</option>
            <option value="informational">Learning</option>
            <option value="navigational">Looking for a site</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Found from
          <select value={filters.from} onChange={(e) => set({ from: e.target.value })} className={INPUT}>
            <option value="">Anywhere</option>
            <option value="gap">Competitor gap</option>
            <option value="ranked">Your rankings</option>
            <option value="gsc">Search Console</option>
            <option value="ideas">Ideas and suggestions</option>
          </select>
        </label>
      </div>
      <p className="text-[13px] text-ink-3" role="status">
        {data.total.toLocaleString('en-US')} {data.total === 1 ? 'keyword' : 'keywords'}
        {loading ? ' · loading…' : ''}
      </p>
      <div className={cn('overflow-x-auto rounded-panel border border-border bg-surface', loading && 'opacity-70')}>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-3 font-semibold first:px-4" aria-sort={filters.sort === c.key ? (filters.desc ? 'descending' : 'ascending') : undefined}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex min-h-8 items-center gap-1 uppercase hover:text-ink">
                    {c.label}
                    {filters.sort === c.key && <span aria-hidden>{filters.desc ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 font-semibold">Cluster</th>
              <th className="px-4 py-3 font-semibold"><span className="sr-only">Keep or remove</span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.term} className={cn('border-b border-border align-top last:border-0', r.status === 'removed' && 'text-ink-3')}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{r.term}</span>
                  {r.status === 'kept' && !r.volume && <span className="ml-2 rounded-pill bg-info-bg px-1.5 py-px text-[11px] font-semibold text-info-text">Customer language</span>}
                  {r.gap && <span className="ml-2 rounded-pill bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary-text" title="A competitor ranks for this and you do not">Competitor gap</span>}
                  {r.features.length > 0 && <span className="block text-[12px] text-ink-3">On Google: {r.features.join(' · ')}</span>}
                  {r.reason && <span className="block text-[12px]">{r.reason}</span>}
                </td>
                <td className="px-3 py-2.5 tabular">{fmt(r.volume)}</td>
                <td className="px-3 py-2.5 tabular">{fmt(r.difficulty)}</td>
                <td className="px-3 py-2.5 tabular">{r.cpc === null ? '–' : `$${r.cpc.toFixed(2)}`}</td>
                <td className="px-3 py-2.5 tabular">{r.position === null ? '–' : r.position}</td>
                <td className="px-3 py-2.5 text-[13px]">{r.cluster ?? '–'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button type="button" onClick={() => flip(r)} aria-label={`${r.status === 'kept' ? 'Remove' : 'Keep'} ${r.term}`} className={cn('min-h-9 rounded-control px-2 text-[13px] font-semibold', r.status === 'kept' ? 'text-ink-3 hover:text-fail-text' : 'text-primary-text hover:underline')}>
                    {r.status === 'kept' ? 'Remove' : 'Keep'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > data.rows.length && (
        <button type="button" disabled={loading} onClick={() => void load(filters, data.rows.length, true)} className={cn(SELECT_SM, 'self-start px-4 font-semibold disabled:opacity-60')}>
          Show more ({(data.total - data.rows.length).toLocaleString('en-US')} left)
        </button>
      )}
    </div>
  );
}
