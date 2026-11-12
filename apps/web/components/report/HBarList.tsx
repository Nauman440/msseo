import type { Segment } from '@seo/core';
import { TONE_FILL, cn } from '@/lib/tones';

export function HBarList({ rows }: { rows: Segment[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[72px_1fr_48px] items-center gap-3 text-[13px]">
          <span className="font-medium text-ink-2 tabular">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-bar bg-chart-track">
            <span className={cn('block h-full rounded-bar', TONE_FILL[r.tone])} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular">{r.value.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  );
}
