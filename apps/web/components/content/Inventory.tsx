import type { InventoryRow } from '@seo/core';
import { CARD, CHIP, pathOf, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { VERDICT } from './verdict';

/** 7.1 / 7.2 page inventory with verdicts, 7.3 decay. */
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-US'));
const ORDER = { remove: 0, merge: 1, improve: 2, keep: 3 } as const;

export function InventorySection({ rows, gsc, ga4 }: { rows: InventoryRow[]; gsc: boolean; ga4: boolean }) {
  const sorted = [...rows].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (b.clicks ?? 0) - (a.clicks ?? 0));
  return (
    <section aria-labelledby="inv-title" className={CARD}>
      <h2 id="inv-title" className="font-display text-xl font-bold">Every page and what to do with it</h2>
      <p className="text-sm text-ink-2">
        {rows.length} pages from the latest audit and the sitemap{gsc ? ', with clicks from the last 90 days' : ''}{ga4 ? ' and leads from Google Analytics' : ''}.
      </p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              <th className={TH}>Page</th>
              <th className={TH}>Do</th>
              <th className={cn(TH, 'text-right')}>Words</th>
              {gsc && <th className={cn(TH, 'text-right')}>Clicks</th>}
              {gsc && <th className={cn(TH, 'text-right')}>Change</th>}
              {gsc && <th className={cn(TH, 'text-right')}>Position</th>}
              {ga4 && <th className={cn(TH, 'text-right')}>Visits</th>}
              {ga4 && <th className={cn(TH, 'text-right')}>Leads</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 300).map((r) => (
              <tr key={r.url}>
                <td className={cn(TD, 'max-w-[340px]')}>
                  <a href={r.url} className="break-all font-semibold hover:underline" target="_blank" rel="noreferrer">{pathOf(r.url)}</a>
                  <p className="text-[12.5px] text-ink-2">{r.reason}</p>
                </td>
                <td className={TD}><span className={cn(CHIP, VERDICT[r.verdict].tone)}>{VERDICT[r.verdict].label}</span></td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.words)}</td>
                {gsc && <td className={cn(TD, 'text-right tabular')}>{n(r.clicks)}</td>}
                {gsc && <td className={cn(TD, 'text-right tabular', (r.change ?? 0) <= -30 && 'font-bold text-high-strong')}>{r.change === null ? '–' : `${r.change > 0 ? '+' : ''}${r.change}%`}</td>}
                {gsc && <td className={cn(TD, 'text-right tabular')}>{r.position === null ? '–' : r.position.toFixed(1)}</td>}
                {ga4 && <td className={cn(TD, 'text-right tabular')}>{n(r.sessions)}</td>}
                {ga4 && <td className={cn(TD, 'text-right tabular')}>{n(r.conversions)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DecaySection({ rows }: { rows: InventoryRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="decay-title" className={CARD}>
      <h2 id="decay-title" className="font-display text-xl font-bold">Pages losing visits</h2>
      <p className="text-sm text-ink-2">Clicks from Google are down 30% or more on the 90 days before. Refresh these first: Google already trusted them.</p>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.url} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2.5 text-sm first:border-t-0">
            <a href={r.url} className="break-all font-semibold hover:underline" target="_blank" rel="noreferrer">{pathOf(r.url)}</a>
            <span className="tabular text-ink-2">{n(r.prevClicks)} → {n(r.clicks)} clicks <b className="text-high-strong">{r.change}%</b></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
