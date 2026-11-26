'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { KEYWORD_ROLES, type BusinessType, type KeywordRow, type KeywordSort } from '@seo/core';
import { setKeywordStatusAction } from '@/app/keywords/actions';
import { INPUT } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';
import { CHIP, difficultyBar, INTENT_CHIP, intentLabel, positionChip, ROLE_CHIP, ROLE_LABEL } from './labels';
import { Term } from '@/components/ui/Term';
import { NewTag } from '@/components/ui/NewTag';

const COLUMNS: { key: KeywordSort; label: string; right?: boolean }[] = [
  { key: 'term', label: 'Keyword' },
  { key: 'volume', label: 'Searches / mo', right: true },
  { key: 'difficulty', label: 'How hard' },
  { key: 'cpc', label: 'Ad price', right: true },
  { key: 'position', label: 'You on Google' },
];
const PAGE = 100;
type Filters = { q: string; show: 'kept' | 'removed' | 'all'; intent: string; role: string; topic: string; from: string; sort: KeywordSort; desc: boolean; low: boolean };
const DEFAULTS: Filters = { q: '', show: 'kept', intent: '', role: '', topic: '', from: '', sort: 'volume', desc: true, low: false };
const TH = 'whitespace-nowrap px-2.5 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-3 align-middle';
const BUTTON = 'inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-5 text-[15px] font-semibold hover:border-ink-3 disabled:opacity-50';

/**
 * Sortable, filterable keyword list with keep/remove per row (4.4 manual override). The server
 * sends one page at a time (`/api/keywords/<domain>`); the first page comes with the HTML.
 */
/** insights: FEATURE_KEYWORD_INSIGHTS (local searches column, map-results marker); localPlace: the place measured. */
export function KeywordTable({ domain, business, topics, initial, initialFrom = '', initialRole = '', insights = false, localPlace = null }: { domain: string; business: BusinessType; topics: { id: string; name: string }[]; initial: { rows: KeywordRow[]; total: number }; initialFrom?: string; initialRole?: string; insights?: boolean; localPlace?: string | null }) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULTS, from: initialFrom, role: initialRole });
  const [data, setData] = useState(initial);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const request = useRef(0);

  const load = useCallback(
    async (f: Filters, from: number) => {
      const id = ++request.current;
      setLoading(true);
      const qs = new URLSearchParams({ q: f.q, show: f.show, intent: f.intent, role: f.role, topic: f.topic, from: f.from, sort: f.sort, desc: f.desc ? '1' : '0', low: f.low ? '1' : '0', offset: String(from) });
      try {
        const res = await fetch(`/api/keywords/${domain}?${qs}`, { cache: 'no-store' });
        if (!res.ok || id !== request.current) return;
        setData((await res.json()) as { rows: KeywordRow[]; total: number });
        setOffset(from);
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
    const t = setTimeout(() => void load(filters, 0), filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key: KeywordSort) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === 'volume' || key === 'cpc' });
  const flip = (r: KeywordRow) =>
    startTransition(async () => {
      await setKeywordStatusAction(domain, r.term, r.status === 'kept' ? 'removed' : 'kept');
      await load(filters, offset);
    });
  const field = 'flex flex-col gap-1 text-[12px] font-bold text-ink-2';
  const shown = data.rows.length ? `Showing ${(offset + 1).toLocaleString('en-US')} to ${(offset + data.rows.length).toLocaleString('en-US')}` : 'Nothing matches';

  return (
    <div className="flex min-w-0 flex-col gap-[22px]">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)_auto]">
        <label className={field}>
          Search
          <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Keyword or topic" className={`${INPUT} text-sm text-ink`} />
        </label>
        <label className={field}>
          Show
          <select value={filters.show} onChange={(e) => set({ show: e.target.value as Filters['show'] })} className={`${INPUT} text-sm text-ink`}>
            <option value="kept">Searches we target</option>
            <option value="removed">Left out (and why)</option>
            <option value="all">Both</option>
          </select>
        </label>
        <label className={field}>
          Type
          <select value={filters.role} onChange={(e) => set({ role: e.target.value })} className={`${INPUT} text-sm text-ink`}>
            <option value="">All types</option>
            {KEYWORD_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          What they want
          <select value={filters.intent} onChange={(e) => set({ intent: e.target.value })} className={`${INPUT} text-sm text-ink`}>
            <option value="">Any</option>
            {['transactional', 'commercial', 'informational', 'navigational'].map((i) => (
              <option key={i} value={i}>{intentLabel(i, business)}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          Topic
          <select value={filters.topic} onChange={(e) => set({ topic: e.target.value })} className={`${INPUT} text-sm text-ink`}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          Where we found it
          <select value={filters.from} onChange={(e) => set({ from: e.target.value })} className={`${INPUT} text-sm text-ink`}>
            <option value="">Anywhere</option>
            <option value="gsc">Search Console</option>
            <option value="gap">Competitors</option>
            <option value="pages">Competitors’ top pages</option>
            <option value="ranked">Your rankings</option>
            <option value="ideas">{business === 'shop' ? 'Your products' : 'Your services'}</option>
          </select>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-[13px] font-semibold text-ink-2">
          <input type="checkbox" checked={filters.low} onChange={(e) => set({ low: e.target.checked })} className="size-4 accent-primary" />
          Show searches with fewer than 10 a month
        </label>
        <a href={`/api/keywords/${domain}/csv`} className={`${BUTTON} min-h-11 justify-center`}>Download CSV</a>
      </div>

      <section aria-labelledby="kw-title" className={cn('flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface p-5', loading && 'opacity-70')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="kw-title" className="font-display text-xl font-bold tabular">
            {data.total.toLocaleString('en-US')} {data.total === 1 ? 'keyword' : 'keywords'}
          </h2>
          <p className="text-[13px] text-ink-2 tabular" role="status">{loading ? 'Loading…' : shown}</p>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          <span>What the columns mean:</span>
          <Term k="volume">Searches / mo</Term>
          <Term k="difficulty">How hard</Term>
          <Term k="position">You on Google</Term>
          <span>Type: intent (main buying search), supporting, informational (questions)</span>
          <Term k="intent">What they want</Term>
          <Term k="topic">Topic</Term>
        </p>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={cn(TH, c.right && 'text-right')} aria-sort={filters.sort === c.key ? (filters.desc ? 'descending' : 'ascending') : undefined}>
                    <button type="button" onClick={() => toggle(c.key)} className="inline-flex min-h-8 items-center gap-1 uppercase hover:text-ink">
                      {c.label}
                      {filters.sort === c.key && <span aria-hidden>{filters.desc ? '↓' : '↑'}</span>}
                    </button>
                  </th>
                ))}
                {insights && localPlace && (
                  <th className={cn(TH, 'text-right')}>
                    Searches in {localPlace} <NewTag className="ml-1" />
                  </th>
                )}
                <th className={TH}>Type</th>
                <th className={TH}>Topic</th>
                <th className={TH}>What they want</th>
                <th className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const intent = intentLabel(r.intent, business);
                return (
                  <tr key={r.term} className={cn(r.status === 'removed' && 'text-ink-3')}>
                    <td className={cn(TD, 'font-semibold')} title={r.features.length ? `On Google: ${r.features.join(' · ')}` : undefined}>
                      {r.term}
                      {r.status === 'kept' && !r.volume && <span className="ml-2 rounded-full bg-info-bg px-1.5 py-px text-[11px] font-semibold text-info-text">Customer language</span>}
                      {r.gap && <span className="ml-2 rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary-text" title="A competitor ranks for this and you do not">Competitor gap</span>}
                      {insights && r.features.some((x) => /^map/i.test(x)) && <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-teal-chip px-1.5 py-px text-[11px] font-semibold text-teal-text" title="Google shows map results (nearby businesses) for this search">Map results</span>}
                      {r.features.length > 0 && <span className="sr-only">. On Google: {r.features.join(', ')}</span>}
                      {r.reason && <span className="block text-[12px] font-normal">{r.reason}</span>}
                    </td>
                    <td className={cn(TD, 'text-right tabular')}>{r.volume === null ? '–' : r.volume.toLocaleString('en-US')}</td>
                    <td className={TD}>
                      {r.difficulty === null ? (
                        '–'
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 rounded-full bg-border" aria-hidden>
                            <div className={cn('h-1.5 rounded-full', difficultyBar(r.difficulty))} style={{ width: `${Math.max(2, Math.min(100, r.difficulty))}%` }} />
                          </div>
                          <span className="tabular">{r.difficulty}</span>
                        </div>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right tabular')}>{r.cpc === null ? '–' : `$${r.cpc.toFixed(2)}`}</td>
                    <td className={TD}>
                      {r.position === null ? <span className="text-ink-2">Not showing</span> : <span className={cn('rounded-[8px] px-[9px] py-[3px] text-[13px] font-extrabold tabular', positionChip(r.position))}>#{r.position}</span>}
                    </td>
                    {insights && localPlace && <td className={cn(TD, 'text-right tabular')}>{r.localVolume === undefined || r.localVolume === null ? '–' : r.localVolume.toLocaleString('en-US')}</td>}
                    <td className={TD}>{r.role ? <span className={cn(CHIP, ROLE_CHIP[r.role])}>{ROLE_LABEL[r.role]}</span> : '–'}</td>
                    <td className={TD}>{r.cluster ?? '–'}</td>
                    <td className={TD}>{intent && r.intent ? <span className={cn(CHIP, INTENT_CHIP[r.intent])}>{intent}</span> : '–'}</td>
                    <td className={cn(TD, 'text-right')}>
                      <button
                        type="button"
                        onClick={() => flip(r)}
                        aria-label={`${r.status === 'kept' ? 'Remove' : 'Put back'} ${r.term}`}
                        className={cn('min-h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[13px] font-semibold', r.status === 'kept' ? 'text-ink-2 hover:text-fail-text' : 'text-primary-text')}
                      >
                        {r.status === 'kept' ? 'Remove' : 'Put back'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2">How hard: 0 (easy) to 100 (very hard) to reach Google’s first page. Ad price: what advertisers pay per click, a sign of how much the search is worth.</p>
          <div className="flex gap-2">
            <button type="button" disabled={loading || offset === 0} onClick={() => void load(filters, Math.max(0, offset - PAGE))} className={BUTTON}>Previous</button>
            <button type="button" disabled={loading || offset + data.rows.length >= data.total} onClick={() => void load(filters, offset + PAGE)} className={BUTTON}>Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
