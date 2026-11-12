import { TONE_FILL, cn, scoreTone } from '@/lib/tones';

export function CategoryBars({
  categories,
  dark = false,
}: {
  categories: { id: string; label: string; score: number }[];
  dark?: boolean;
}) {
  return (
    <ul className="space-y-3.5">
      {categories.map((c) => (
        <li key={c.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className={cn('font-medium', dark ? 'text-white/80' : 'text-ink-2')}>{c.label}</span>
            <span className={cn('font-semibold tabular', dark ? 'text-white' : 'text-ink')}>{c.score}</span>
          </div>
          <div
            className={cn('h-1.5 overflow-hidden rounded-bar', dark ? 'bg-white/10' : 'bg-chart-track')}
            role="img"
            aria-label={`${c.label}: ${c.score} out of 100`}
          >
            <div className={cn('h-full rounded-bar', TONE_FILL[scoreTone(c.score)])} style={{ width: `${c.score}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
