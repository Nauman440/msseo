import type { LocalAudit } from '@seo/core';
import { cn } from '@/lib/tones';

/** 9.6 Map pack ranking grid: one 5 × 5 heat map per search, north at the top, the business in the middle. */
const tone = (r: number | null) => (r === null ? 'bg-high-bg text-high-strong' : r <= 3 ? 'bg-teal-chip text-teal-text' : r <= 10 ? 'bg-amber-bg text-amber-text' : 'bg-high-bg text-high-strong');

export function MapGrid({ grid }: { grid: NonNullable<LocalAudit['grid']> }) {
  const cells = grid.size * grid.size;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grid.searches.map((s) => (
          <figure key={s.search} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
            <figcaption className="text-sm font-bold">“{s.search}”</figcaption>
            <div role="img" aria-label={`${s.search}: in the top 3 at ${s.top3} of ${cells} points, shown at ${s.found} points${s.average !== null ? `, average position ${s.average}` : ''}`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}>
              {s.ranks.map((r, i) => (
                <span key={i} className={cn('flex aspect-square items-center justify-center rounded-[6px] text-[12px] font-bold tabular', tone(r), i === Math.floor(cells / 2) && 'ring-2 ring-night')}>
                  {r === null ? '–' : r > 20 ? '20+' : r}
                </span>
              ))}
            </div>
            <p className="text-[12.5px] text-ink-2 tabular">Top 3 at {s.top3} of {cells} points{s.average !== null ? ` · average #${s.average}` : ''}</p>
          </figure>
        ))}
      </div>
      <p className="text-[12.5px] text-ink-2">
        Each square is a point {grid.radiusKm / ((grid.size - 1) / 2)} km apart, up to {grid.radiusKm} km from your business (outlined square). Green: top 3 (in the map pack) · amber: 4–10 · red: lower or not shown.
      </p>
    </div>
  );
}
