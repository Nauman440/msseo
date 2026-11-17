import type { ActionItem, ActionWorkspace, Bucket } from '@seo/core';
import { cn, SEVERITY_TONE, TONE_FILL } from '@/lib/tones';
import { BUCKET_LABEL } from './labels';

const BUCKETS: Bucket[] = ['d30', 'd60', 'd90'];
const DAY = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * 12.7 The 30/60/90-day roadmap: a drawn 90-day timeline (start, today, the three months) with the
 * actions of each month underneath. Used on screen and in the client PDF (no md:/lg: classes).
 */
export function Roadmap({ ws, max = 8, now = new Date() }: { ws: ActionWorkspace; max?: number; now?: Date }) {
  const live = ws.actions.filter((a) => a.status !== 'dismissed');
  if (!live.length) return null;
  const start = Math.min(...live.map((a) => Date.parse(a.createdAt)));
  const today = Math.max(0, Math.min(90, (now.getTime() - start) / DAY));
  const byBucket = (b: Bucket) => live.filter((a) => a.bucket === b).sort((x, y) => Number(isDone(x)) - Number(isDone(y)) || y.priority - x.priority);
  return (
    <div className="flex flex-col gap-4">
      <div className="relative pt-6" aria-hidden>
        <div className="flex h-3 overflow-hidden rounded-bar bg-sunken">
          {BUCKETS.map((b, i) => {
            const items = byBucket(b);
            const done = items.length ? items.filter(isDone).length / items.length : 0;
            return (
              <div key={b} className={cn('relative h-full flex-1', i > 0 && 'border-l-2 border-surface')}>
                <div className={cn('h-full', TONE_FILL.pass)} style={{ width: `${Math.round(done * 100)}%` }} />
              </div>
            );
          })}
        </div>
        {today > 0 && today < 90 && (
          <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${(today / 90) * 100}%` }}>
            <span className="rounded-full bg-night px-2 py-0.5 text-[11px] font-bold text-white">Today</span>
            <span className="h-5 w-0.5 bg-night" />
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-ink-3 tabular">
          <span>{shortDate(start)}</span>
          <span>{shortDate(start + 30 * DAY)}</span>
          <span>{shortDate(start + 60 * DAY)}</span>
          <span>{shortDate(start + 90 * DAY)}</span>
        </div>
      </div>
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {BUCKETS.map((b) => {
          const items = byBucket(b);
          return (
            <li key={b} className="pdf-avoid flex flex-col gap-2 rounded-[14px] border border-border p-4">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[15px] font-bold">{BUCKET_LABEL[b]}</span>
                <span className="text-[12px] font-semibold text-ink-3 tabular">
                  {items.filter(isDone).length}/{items.length} done
                </span>
              </p>
              {items.length ? (
                <ul className="flex flex-col gap-1.5">
                  {items.slice(0, max).map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-[13px] leading-snug">
                      <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', isDone(a) ? TONE_FILL.pass : TONE_FILL[SEVERITY_TONE[a.severity]])} />
                      <span className={cn(isDone(a) && 'text-ink-3 line-through')}>{a.title}</span>
                    </li>
                  ))}
                  {items.length > max && <li className="text-[12px] text-ink-3">and {items.length - max} more</li>}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">Nothing planned.</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const isDone = (a: ActionItem) => a.status === 'done' || a.status === 'verified';
