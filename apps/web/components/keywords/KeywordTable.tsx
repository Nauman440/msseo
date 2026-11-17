'use client';

import { useMemo, useState } from 'react';
import { setKeywordStatusAction } from '@/app/keywords/actions';
import { INPUT, SELECT_SM } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';

export type KeywordRow = {
  term: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: string | null;
  position: number | null;
  status: 'kept' | 'removed';
  reason: string | null;
  cluster: string | null;
};

type SortKey = 'term' | 'volume' | 'difficulty' | 'cpc' | 'position';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'term', label: 'Keyword' },
  { key: 'volume', label: 'Searches / mo' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'cpc', label: 'CPC' },
  { key: 'position', label: 'Your position' },
];
const PAGE = 100;
const fmt = (v: number | null) => (v === null ? '–' : v.toLocaleString('en-US'));

/** Sortable, filterable keyword list with keep/remove per row (4.4 manual override). */
export function KeywordTable({ domain, rows }: { domain: string; rows: KeywordRow[] }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'kept' | 'removed' | 'all'>('kept');
  const [intent, setIntent] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'volume', desc: true });
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => (show === 'all' || r.status === show) && (!intent || r.intent === intent) && (!needle || r.term.includes(needle) || r.cluster?.toLowerCase().includes(needle)));
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      if (sort.key === 'term') return a.term.localeCompare(b.term) * dir;
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null) return y === null ? 0 : 1; // empty values last either way
      if (y === null) return -1;
      return (x - y) * dir;
    });
  }, [rows, q, show, intent, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'term' && key !== 'position' && key !== 'difficulty' }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Search the list
          <input value={q} onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }} placeholder="Keyword or cluster" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Show
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={INPUT}>
            <option value="kept">Kept</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Intent
          <select value={intent} onChange={(e) => setIntent(e.target.value)} className={INPUT}>
            <option value="">Any</option>
            <option value="transactional">Ready to buy</option>
            <option value="commercial">Comparing</option>
            <option value="informational">Learning</option>
            <option value="navigational">Looking for a site</option>
          </select>
        </label>
      </div>
      <p className="text-[13px] text-ink-3" role="status">{list.length.toLocaleString('en-US')} {list.length === 1 ? 'keyword' : 'keywords'}</p>
      <div className="overflow-x-auto rounded-panel border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-3 font-semibold first:px-4" aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex min-h-8 items-center gap-1 uppercase hover:text-ink">
                    {c.label}
                    {sort.key === c.key && <span aria-hidden>{sort.desc ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 font-semibold">Cluster</th>
              <th className="px-4 py-3 font-semibold"><span className="sr-only">Keep or remove</span></th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((r) => (
              <tr key={r.term} className={cn('border-b border-border align-top last:border-0', r.status === 'removed' && 'text-ink-3')}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{r.term}</span>
                  {r.status === 'kept' && !r.volume && <span className="ml-2 rounded-pill bg-info-bg px-1.5 py-px text-[11px] font-semibold text-info-text">Customer language</span>}
                  {r.reason && <span className="block text-[12px]">{r.reason}</span>}
                </td>
                <td className="px-3 py-2.5 tabular">{fmt(r.volume)}</td>
                <td className="px-3 py-2.5 tabular">{fmt(r.difficulty)}</td>
                <td className="px-3 py-2.5 tabular">{r.cpc === null ? '–' : `$${r.cpc.toFixed(2)}`}</td>
                <td className="px-3 py-2.5 tabular">{r.position === null ? '–' : r.position}</td>
                <td className="px-3 py-2.5 text-[13px]">{r.cluster ?? '–'}</td>
                <td className="px-4 py-2.5 text-right">
                  <form action={setKeywordStatusAction.bind(null, domain, r.term, r.status === 'kept' ? 'removed' : 'kept')}>
                    <button type="submit" aria-label={`${r.status === 'kept' ? 'Remove' : 'Keep'} ${r.term}`} className={cn('min-h-9 rounded-control px-2 text-[13px] font-semibold', r.status === 'kept' ? 'text-ink-3 hover:text-fail-text' : 'text-primary-text hover:underline')}>
                      {r.status === 'kept' ? 'Remove' : 'Keep'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE * 2)} className={cn(SELECT_SM, 'self-start px-4 font-semibold')}>
          Show more ({(list.length - limit).toLocaleString('en-US')} left)
        </button>
      )}
    </div>
  );
}
