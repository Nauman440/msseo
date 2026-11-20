import Link from 'next/link';
import type { Journey } from '@/lib/journey';
import { cn } from '@/lib/tones';
import { SkipStep } from './SkipStep';

/** The customer's SEO journey on the overview: done steps, the step to do now, and what comes next. */
export function JourneyCard({ journey, domain }: { journey: Journey; domain: string }) {
  const now = journey.current;
  return (
    <section aria-labelledby="journey-title" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="journey-title" className="font-display text-xl font-bold">Your SEO steps</h2>
        <p className="text-sm text-ink-2 tabular">{journey.steps.filter((x) => x.done).length} of {journey.steps.length} done</p>
      </div>
      {now ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-primary-chip p-4">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-primary-heading">Now · step {now.n}</p>
          <p className="font-display text-lg font-bold">{now.title}</p>
          <p className="text-sm text-ink-2">{now.why}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={now.href} className="inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover">{now.cta}</Link>
            {now.skippable && (now.id === 'google' || now.id === 'website') && <SkipStep domain={domain} step={now.id} />}
          </div>
          {(now.id === 'competitors' || now.id === 'keywords' || now.id === 'actions') && (
            <p className="text-[13px] text-ink-2">Nothing to do here: autopilot prepares this for you within a few minutes of the audit. This page fills in by itself.</p>
          )}
        </div>
      ) : (
        <p className="rounded-[14px] bg-teal-chip p-4 text-sm font-semibold text-teal-text">Every step is set up. Work through your action plan; results are checked every week.</p>
      )}
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {journey.steps.map((x) => (
          <li key={x.id} className={cn('flex items-start gap-3 rounded-[12px] border p-3', x === now ? 'border-primary' : 'border-border')}>
            <span
              aria-hidden
              className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', x.done ? 'bg-teal-chip text-teal-text' : x === now ? 'bg-primary text-primary-ink' : 'bg-sunken text-ink-3')}
            >
              {x.done ? '✓' : x.n}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-bold', !x.done && x !== now && 'text-ink-3')}>
                <span className="sr-only">Step {x.n}{x.done ? ' (done)' : x === now ? ' (now)' : ' (later)'}: </span>
                {x.done || x === now ? <Link href={x.href} className="hover:underline">{x.title}</Link> : x.title}
              </span>
              {x.skipped && <span className="block text-[12px] text-ink-3">Skipped for now: you can still do it any time.</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
