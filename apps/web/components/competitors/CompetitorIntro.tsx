import type { CompetitorWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { RunButtons } from './forms';
import type { Insight } from './insights';

/**
 * The top of Competitors, in plain words: who you are up against, what autopilot did and when it runs
 * next, and the one button anyone needs. Then "What we learned": the comparisons that matter.
 */
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Autopilot re-runs a site when its last run is this old (packages/db/src/autopilot.ts). */
const AUTOPILOT_DAYS = 30;
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export function CompetitorIntro({ ws, rivals, watching, audience, autopilotAt }: {
  ws: CompetitorWorkspace;
  rivals: number;
  watching: number;
  audience: 'team' | 'customer';
  /** Last autopilot run for this site (null = not on autopilot). */
  autopilotAt: string | null;
}) {
  const n = ws.searches.length;
  const last = ws.lastRunAt ? new Date(ws.lastRunAt) : null;
  const next = autopilotAt ? new Date(Date.parse(autopilotAt) + AUTOPILOT_DAYS * 86_400_000) : null;
  const body = last
    ? `We searched Google for ${n} ${n === 1 ? 'thing' : 'things'} your customers type, in ${ws.country}, including the map, and found ${rivals} ${rivals === 1 ? 'business' : 'businesses'} competing with you for them. ${watching ? `We keep an eye on the ${watching} that matter most and compare you with them.` : 'Pick the ones that matter most below, and we will keep an eye on them.'}`
    : n
      ? `We will search Google for ${n} ${n === 1 ? 'thing' : 'things'} your customers type, in ${ws.country}, and show you who comes up. ${autopilotAt ? 'Autopilot does this for you a few minutes after your first audit, or you can start it now.' : 'It takes about a minute.'}`
      : 'Tell us what your customers type into Google (under “What we searched”) and we will show you who comes up.';
  return (
    <section aria-labelledby="comp-intro" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-[22px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-bold', autopilotAt ? 'bg-teal-chip text-teal-text' : 'bg-sunken text-ink-2')}>{autopilotAt ? 'Autopilot on' : 'Updated by hand'}</span>
        {last && <span className="text-[13px] text-ink-2">Last checked {day(last)}{next ? ` · next automatic check around ${day(next)}` : ''}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id="comp-intro" className="font-display text-[22px] font-bold tracking-[-0.01em]">Who you are up against on Google</h2>
        <p className="max-w-[760px] text-[15px] leading-relaxed text-ink-2">{body}</p>
        {autopilotAt && last && <p className="max-w-[760px] text-[14px] leading-relaxed text-ink-2">You do not need to do anything here: every month autopilot searches again, spots new competitors and updates the comparison.</p>}
      </div>
      {n > 0 && <RunButtons domain={ws.domain} canRefresh={audience === 'team' && watching > 0} hasRun={Boolean(last)} />}
    </section>
  );
}

/** "What we learned": up to four plain comparisons, each with one thing to do. */
export function InsightCards({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section aria-labelledby="learned" className="flex flex-col gap-3">
      <div>
        <h2 id="learned" className="font-display text-xl font-bold">What we learned</h2>
        <p className="mt-1 text-sm text-ink-2">How you compare with the competitors that matter most. Visits are estimates.</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {insights.map((i) => (
          <li key={i.id} className={cn('flex flex-col gap-2 rounded-card border bg-surface p-5', i.ahead ? 'border-border' : 'border-primary-tint')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={EYEBROW}>{i.title}</h3>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', i.ahead ? 'bg-teal-chip text-teal-text' : 'bg-amber-bg text-amber-text')}>{i.ahead ? 'You are ahead' : 'They are ahead'}</span>
            </div>
            <p className="text-[15.5px] font-semibold leading-snug">{i.finding}</p>
            <p className="text-sm leading-normal text-ink-2"><span className="font-semibold text-ink">What to do: </span>{i.todo}</p>
            {i.link && (
              <a href={i.link.href} className="mt-auto inline-flex min-h-11 items-center self-start text-sm font-semibold text-primary-heading underline underline-offset-[3px]">
                {i.link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
