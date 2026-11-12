import type { Segment } from '@seo/core';
import { TONE_FILL, cn } from '@/lib/tones';

const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);

export function StackedBar({ segments, className }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(', ');

  return (
    <div className={className}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-bar" role="img" aria-label={summary}>
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} className={cn('h-full first:rounded-l-bar last:rounded-r-bar', TONE_FILL[s.tone])} style={{ width: `${pct(s.value, total)}%` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-sm', TONE_FILL[s.tone])} />
            <span className="text-ink-2">{s.label}</span>
            <span className="font-semibold tabular">{s.value.toLocaleString('en-US')}</span>
            <span className="text-ink-3 tabular">{Math.round(pct(s.value, total))}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
