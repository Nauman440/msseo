import { ACTION_BUCKETS, type ActionItem, type ActionWorkspace } from '@seo/core';
import type { ConnectionView } from '@/lib/connections';
import { ActionRow } from './ActionRow';

const MONTH_MS = 30 * 86_400_000;
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
/** Each to-do sits in its plan month (AI plan), else in its roadmap month. */
export const monthOf = (a: ActionItem) => a.plan?.month ?? Math.max(1, ACTION_BUCKETS.indexOf(a.bucket) + 1);
/** Done or checked after the fix. */
export const isDone = (a: ActionItem) => a.status === 'done' || a.status === 'verified';
/** "To do" and "Done" counts for the Changes tab's sub-tabs. */
export function taskCounts(ws: ActionWorkspace): { todo: number; done: number } {
  const shown = ws.actions.filter((a) => a.status !== 'dismissed');
  return { todo: shown.filter((a) => !isDone(a)).length, done: shown.filter(isDone).length };
}

/** When the plan started: the AI plan's start date, else the first action. */
function planStart(ws: ActionWorkspace): Date | null {
  const s = ws.aiPlan?.startDate ?? ws.actions.map((a) => a.createdAt).sort()[0];
  return s ? new Date(s.length === 10 ? `${s}T00:00:00Z` : s) : null;
}

/** The month of the plan we are in now (1–6), counted in 30-day months from the start. */
export function currentPlanMonth(ws: ActionWorkspace, now = new Date()): number {
  const start = planStart(ws);
  if (!start) return 1;
  return Math.max(1, Math.min(6, Math.floor((now.getTime() - start.getTime()) / MONTH_MS) + 1));
}

/**
 * The plan's to-dos month by month. With `current`, only that month can be opened and worked on;
 * the other months show as locked (future months say when they open). `show` limits the rows to the
 * tasks still left ("todo") or the finished ones ("done"; every month, none locked, newest month first).
 */
export function PlanMonths({ ws, audience, site = null, connectHref, current, title = 'Your 6-month plan', show }: {
  ws: ActionWorkspace;
  audience: 'team' | 'customer';
  site?: ConnectionView | null;
  connectHref?: string;
  current?: number;
  title?: string;
  show?: 'todo' | 'done';
}) {
  const shown = ws.actions.filter((a) => a.status !== 'dismissed');
  const keep = (a: ActionItem) => (show === 'done' ? isDone(a) : show === 'todo' ? !isDone(a) : true);
  const locking = show === 'done' ? undefined : current;
  const dismissed = ws.actions.filter((a) => a.status === 'dismissed');
  const themes = new Map((ws.aiPlan?.months ?? []).map((m) => [m.month, m]));
  const start = planStart(ws);
  const months = [1, 2, 3, 4, 5, 6]
    .map((month) => {
      const all = shown.filter((a) => monthOf(a) === month);
      const list = all.filter(keep).sort((a, b) => (a.plan?.week ?? 0) - (b.plan?.week ?? 0) || b.priority - a.priority);
      return { month, theme: themes.get(month)?.theme ?? '', goal: themes.get(month)?.goal ?? '', list, total: all.length, done: all.filter(isDone).length };
    })
    .filter((m) => (show === 'done' ? m.list.length > 0 : m.total > 0 || m.theme));
  if (show === 'done') months.reverse();
  if (!months.length) {
    return show ? (
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="rounded-[18px] border border-border bg-surface px-5 py-4 text-sm text-ink-2">
          {show === 'done' ? 'Nothing is done yet. Finished changes show here as soon as they are made.' : 'Everything in the plan is done.'}
        </p>
      </section>
    ) : null;
  }
  const rows = (list: ActionItem[]) => list.map((a) => <ActionRow key={a.id} domain={ws.domain} action={a} audience={audience} site={site} connectHref={connectHref} />);

  return (
    <section aria-labelledby="six-months" className="flex flex-col gap-3">
      <h2 id="six-months" className="font-display text-xl font-bold">{title}</h2>
      {locking !== undefined && <p className="-mt-1 text-sm text-ink-2">You work on one month at a time. Month {current} is open now; the next month opens when this one ends.</p>}
      {months.map((m) => {
        const head = (
          <>
            <span className="text-[12px] font-bold uppercase tracking-wide text-primary-text">Month {m.month}</span>
            <span className="font-semibold">{m.theme || `${m.total} ${m.total === 1 ? 'to-do' : 'to-dos'}`}</span>
            <span className="text-[13px] text-ink-2 tabular">{m.done} of {m.total} done</span>
          </>
        );
        if (locking !== undefined && m.month !== locking) {
          const opens = start && m.month > locking ? new Date(start.getTime() + (m.month - 1) * MONTH_MS) : null;
          return (
            <div key={m.month} aria-disabled="true" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[18px] border border-border bg-sunken px-5 py-4 text-ink-2">
              <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" className="shrink-0 self-center"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {head}
              <span className="text-[13px]">{opens ? `Opens ${day(opens)}` : 'Closed'}</span>
            </div>
          );
        }
        return (
          <details key={m.month} open={show === 'done' || m.month === (current ?? 1)} className="group rounded-[18px] border border-border bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4">{head}</summary>
            {m.goal && <p className="px-5 pb-3 text-[14px] text-ink-2">{m.goal}</p>}
            {m.list.length > 0 ? (
              <ul aria-label={`Month ${m.month} to-dos`} className="divide-y divide-border border-t border-border">{rows(m.list)}</ul>
            ) : (
              <p className="border-t border-border px-5 py-3 text-sm text-ink-2">{show === 'todo' && m.total ? 'Everything this month is done.' : 'Nothing planned for this month yet.'}</p>
            )}
          </details>
        );
      })}
      {current === undefined && !show && dismissed.length > 0 && (
        <details className="rounded-[18px] border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Dismissed ({dismissed.length})</summary>
          <ul className="divide-y divide-border">{rows(dismissed)}</ul>
        </details>
      )}
    </section>
  );
}
