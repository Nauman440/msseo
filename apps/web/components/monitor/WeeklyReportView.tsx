import type { WeeklyReport } from '@seo/core';
import { CARD } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { Moves } from './MonthlyReportView';
import { AlertList, ChangeTiles } from './parts';

/** 13.2 One week's report (screen and PDF): the weekly snapshot against the one before it. */
const longDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function WeeklyReportView({ r, toolbar, readOnly = false }: { r: WeeklyReport; toolbar?: React.ReactNode; readOnly?: boolean }) {
  return (
    <article className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-primary-heading">Weekly report</p>
          <h1 className="font-display text-3xl font-extrabold">Week of {longDay(r.date)}</h1>
          <p className="text-ink-2">{r.domain}</p>
        </div>
        {toolbar}
      </div>
      <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-[15px] font-semibold">{r.headline}</p>
      {r.snapshot && (
        <section aria-labelledby="w-numbers" className={cn(CARD, 'pdf-avoid')}>
          <h2 id="w-numbers" className="font-display text-xl font-bold">The numbers</h2>
          <p className="text-sm text-ink-2">{r.previousDate ? `${longDay(r.date)} against ${longDay(r.previousDate)}.` : 'The starting point: later weeks are compared with this one.'}</p>
          <ChangeTiles changes={r.changes} against={r.previousDate ? 'last week' : ''} />
        </section>
      )}
      {(r.winners.length > 0 || r.losers.length > 0) && (
        <section aria-labelledby="w-ranks" className={cn(CARD, 'pdf-avoid')}>
          <h2 id="w-ranks" className="font-display text-xl font-bold">Rankings this week</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Moves title="Moved up" rows={r.winners} good />
            <Moves title="Moved down" rows={r.losers} good={false} />
          </div>
        </section>
      )}
      <section aria-labelledby="w-work" className={cn(CARD, 'pdf-avoid')}>
        <h2 id="w-work" className="font-display text-xl font-bold">Work done this week</h2>
        {r.actionsDone.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {r.actionsDone.map((a) => <li key={`${a.title}-${a.doneAt}`}>{a.title}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No fixes were marked done this week.</p>
        )}
        <p className="text-sm text-ink-2">{r.actionsOpen} fixes are planned or in progress.</p>
      </section>
      <section aria-labelledby="w-alerts" className={cn(CARD, 'pdf-avoid')}>
        <h2 id="w-alerts" className="font-display text-xl font-bold">What happened</h2>
        <AlertList domain={r.domain} alerts={r.alerts} readOnly={readOnly} />
      </section>
    </article>
  );
}
