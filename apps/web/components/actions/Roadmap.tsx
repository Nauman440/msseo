import { ACTION_BUCKETS, type ActionItem, type ActionWorkspace, type Bucket, ownerText } from '@seo/core';
import { cn, SEVERITY_TONE, TONE_FILL, TONE_SOFT } from '@/lib/tones';
import { BUCKET_LABEL } from './labels';

const BUCKETS = ACTION_BUCKETS;
const SPAN = BUCKETS.length * 30;
const DAY = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SEV_LABEL: Record<(typeof SEVERITIES)[number], string> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const isDone = (a: ActionItem) => a.status === 'done' || a.status === 'verified';

function ActionLine({ a }: { a: ActionItem }) {
  return (
    <li className="flex items-start gap-2 text-[13px] leading-snug">
      <span aria-hidden className={cn('mt-[5px] size-2 shrink-0 rounded-full', isDone(a) ? TONE_FILL.pass : TONE_FILL[SEVERITY_TONE[a.severity]])} />
      <span className={cn('line-clamp-2 min-w-0', isDone(a) && 'text-ink-3 line-through')} title={ownerText(a.title)}>
        {ownerText(a.title)}
      </span>
    </li>
  );
}

/**
 * 12.7 The six-month roadmap: a timeline of six equal months (dates under each, progress inside, a
 * "Today" marker), then one card per month with its progress, how many items of each severity, the
 * most important actions and the rest folded away. `columns` 3 on wide screens (on-screen plan page);
 * the report and PDF use 2 (no md:/lg: classes there).
 */
export function Roadmap({ ws, max = 5, now = new Date(), columns = 2 }: { ws: ActionWorkspace; max?: number; now?: Date; columns?: 2 | 3 }) {
  const live = ws.actions.filter((a) => a.status !== 'dismissed');
  if (!live.length) return null;
  const start = Math.min(...live.map((a) => Date.parse(a.createdAt)));
  const today = Math.max(0, Math.min(SPAN, (now.getTime() - start) / DAY));
  const byBucket = (b: Bucket) => live.filter((a) => a.bucket === b).sort((x, y) => Number(isDone(x)) - Number(isDone(y)) || y.priority - x.priority);
  const range = (i: number) => `${shortDate(start + i * 30 * DAY)} – ${shortDate(start + ((i + 1) * 30 - 1) * DAY)}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Timeline: six equal segments, each labelled under its own segment. */}
      <div className="relative pt-7">
        <div className="flex gap-1" aria-hidden>
          {BUCKETS.map((b) => {
            const items = byBucket(b);
            const done = items.length ? items.filter(isDone).length / items.length : 0;
            return (
              <div key={b} className="h-2.5 flex-1 overflow-hidden rounded-bar bg-sunken">
                <div className={cn('h-full', TONE_FILL.pass)} style={{ width: `${Math.round(done * 100)}%` }} />
              </div>
            );
          })}
        </div>
        {today > 0 && today < SPAN && (
          <div aria-hidden className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${(today / SPAN) * 100}%` }}>
            <span className="rounded-full bg-night px-2 py-0.5 text-[11px] font-bold text-white">Today</span>
            <span className="h-[18px] w-0.5 bg-night" />
          </div>
        )}
        <ol className="mt-2 flex gap-1 text-center">
          {BUCKETS.map((b, i) => (
            <li key={b} className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold">
                <span className="sm:hidden">M{i + 1}</span>
                <span className="hidden sm:inline">{BUCKET_LABEL[b]}</span>
              </span>
              <span className="hidden text-[11px] text-ink-3 tabular sm:block">{range(i)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* One card per month, equal height in each row. */}
      <ol className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3')}>
        {BUCKETS.map((b, i) => {
          const items = byBucket(b);
          const done = items.filter(isDone).length;
          const counts = SEVERITIES.map((s) => ({ s, n: items.filter((a) => a.severity === s && !isDone(a)).length })).filter((c) => c.n > 0);
          const first = items.slice(0, max);
          const rest = items.slice(max);
          return (
            <li key={b} className="pdf-avoid flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-display text-[15px] font-bold">{BUCKET_LABEL[b]}</h4>
                  <p className="text-[12px] text-ink-3 tabular">{range(i)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-[12px] font-bold tabular text-ink-2">
                  {done}/{items.length} done
                </span>
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-bar bg-sunken">
                <div className={cn('h-full', TONE_FILL.pass)} style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }} />
              </div>
              {counts.length > 0 && (
                <p className="flex flex-wrap gap-1.5">
                  {counts.map((c) => (
                    <span key={c.s} className={cn('rounded-pill px-2 py-0.5 text-[11px] font-bold tabular', TONE_SOFT[SEVERITY_TONE[c.s]])}>
                      {c.n} {SEV_LABEL[c.s]}
                    </span>
                  ))}
                </p>
              )}
              {items.length ? (
                <ul className="flex flex-col gap-2 border-t border-border pt-3">
                  {first.map((a) => <ActionLine key={a.id} a={a} />)}
                </ul>
              ) : (
                <p className="border-t border-border pt-3 text-[13px] text-ink-3">Nothing planned.</p>
              )}
              {rest.length > 0 && (
                <details className="group mt-auto">
                  <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-primary-heading hover:underline [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show {rest.length} more</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {rest.map((a) => <ActionLine key={a.id} a={a} />)}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
