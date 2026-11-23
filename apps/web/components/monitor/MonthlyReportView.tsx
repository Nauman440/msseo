import type { MonthlyReport, Snapshot } from '@seo/core';
import { CARD, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { PrintButton } from './forms';
import { AlertList, ChangeTiles } from './parts';

/** 13.3 The monthly report (screen and print). The client's copy is printed or saved as PDF from here. */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const pos = (p: number | null) => (p === null ? '>10' : `#${p}`);

export function Moves({ title, rows, good }: { title: string; rows: MonthlyReport['winners']; good: boolean }) {
  if (!rows.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="font-bold">{title}</h3>
      <table className="w-full text-sm">
        <thead><tr><th className={TH}>Search</th><th className={cn(TH, 'text-right')}>Before</th><th className={cn(TH, 'text-right')}>Now</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.keyword}>
              <td className={cn(TD, 'font-semibold')}>{r.keyword}</td>
              <td className={cn(TD, 'text-right tabular text-ink-2')}>{pos(r.before)}</td>
              <td className={cn(TD, 'text-right tabular font-bold', good ? 'text-teal-text' : 'text-high-strong')}>{pos(r.now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const shortDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const num = (v: number | null, digits = 0) => (v === null ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: digits }));
const WEEK_COLS: { label: string; v: (s: Snapshot) => string }[] = [
  { label: 'Score', v: (s) => num(s.score) },
  { label: 'Clicks (28 days)', v: (s) => num(s.clicks28) },
  { label: 'Avg position', v: (s) => num(s.position28, 1) },
  { label: 'Leads (28 days)', v: (s) => num(s.leads28) },
  { label: 'On page 1', v: (s) => `${s.top10} of ${s.tracked}` },
  { label: 'Reviews', v: (s) => num(s.reviews) },
];

/** The combined report's week-by-week table: one row per weekly snapshot of the month. */
function WeekByWeek({ weeks }: { weeks: Snapshot[] }) {
  if (weeks.length < 2) return null;
  return (
    <section aria-labelledby="m-weeks" className={cn(CARD, 'pdf-avoid')}>
      <h2 id="m-weeks" className="font-display text-xl font-bold">Week by week</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className={TH}>Week of</th>{WEEK_COLS.map((c) => <th key={c.label} className={cn(TH, 'text-right')}>{c.label}</th>)}</tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.date}>
                <td className={cn(TD, 'font-semibold')}>{shortDay(w.date)}</td>
                {WEEK_COLS.map((c) => <td key={c.label} className={cn(TD, 'text-right tabular')}>{c.v(w)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** toolbar: what sits next to the title (screen: PDF download; print: nothing). readOnly: no alert buttons. */
export function MonthlyReportView({ r, toolbar = <PrintButton />, readOnly = false }: { r: MonthlyReport; toolbar?: React.ReactNode; readOnly?: boolean }) {
  return (
    <article className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-primary-heading">Monthly report · whole month</p>
          <h1 className="font-display text-3xl font-extrabold">{monthName(r.month)}</h1>
          <p className="text-ink-2">{r.domain}</p>
        </div>
        {toolbar}
      </div>
      {!r.to ? (
        <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">No snapshot was taken in this month yet.</p>
      ) : (
        <section aria-labelledby="m-numbers" className={cn(CARD, 'pdf-avoid')}>
          <h2 id="m-numbers" className="font-display text-xl font-bold">The numbers</h2>
          <p className="text-sm text-ink-2">{r.from ? `${r.to.date} against ${r.from.date}.` : `Snapshot of ${r.to.date}: the starting point.`}</p>
          <ChangeTiles changes={r.changes} against={r.from ? 'before' : ''} />
        </section>
      )}
      <WeekByWeek weeks={r.weeks ?? []} />
      {(r.winners.length > 0 || r.losers.length > 0) && (
        <section aria-labelledby="m-ranks" className={cn(CARD, 'pdf-avoid')}>
          <h2 id="m-ranks" className="font-display text-xl font-bold">Rankings</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Moves title="Moved up" rows={r.winners} good />
            <Moves title="Moved down" rows={r.losers} good={false} />
          </div>
        </section>
      )}
      <section aria-labelledby="m-work" className={cn(CARD, 'pdf-avoid')}>
        <h2 id="m-work" className="font-display text-xl font-bold">Work done</h2>
        {r.actionsDone.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {r.actionsDone.map((a) => <li key={`${a.title}-${a.doneAt}`}>{a.title}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No fixes were marked done this month.</p>
        )}
        <p className="text-sm text-ink-2">{r.actionsOpen} fixes are planned or in progress.</p>
      </section>
      <section aria-labelledby="m-alerts" className={cn(CARD, 'pdf-avoid')}>
        <h2 id="m-alerts" className="font-display text-xl font-bold">What happened</h2>
        <AlertList domain={r.domain} alerts={r.alerts} readOnly={readOnly} />
      </section>
    </article>
  );
}
