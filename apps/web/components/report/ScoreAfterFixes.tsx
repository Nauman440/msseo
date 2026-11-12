import { TONE_FILL, cn, scoreTone } from '@/lib/tones';

export function ScoreAfterFixes({ today, after }: { today: number; after: number }) {
  const bars = [
    { label: 'Today', value: today },
    { label: 'After fixes', value: after },
  ];
  return (
    <div>
      <div className="flex h-44 items-end gap-6 border-b border-border pl-1">
        {bars.map((b) => (
          <div key={b.label} className="flex h-full w-20 flex-col justify-end">
            <span className="mb-2 text-center font-display text-xl font-semibold tabular">{b.value}</span>
            <div
              className={cn('w-full rounded-t-[6px]', TONE_FILL[scoreTone(b.value)])}
              style={{ height: `${b.value}%` }}
              role="img"
              aria-label={`${b.label}: ${b.value}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-6 pl-1 text-[13px] font-medium text-ink-2">
        {bars.map((b) => (
          <span key={b.label} className="w-20 text-center">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
