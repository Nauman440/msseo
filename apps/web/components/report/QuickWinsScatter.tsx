import { TONE_HEX, TRACK_HEX } from '@/lib/tones';

/**
 * §9.2 QuickWinsScatter: queries by average position (x, 1 at the left) and impressions
 * (y, log scale). The 4–20 band is shaded; queries inside it are the quick wins (2.9.4).
 * Plain SVG so it renders identically on screen and in the PDF.
 */
type Point = { x: number; y: number; label: string };

const W = 400;
const H = 230;
const PAD = { l: 36, r: 10, t: 10, b: 28 };

export function QuickWinsScatter({ points, band, xLabel, yLabel }: { points: Point[]; band: [number, number]; xLabel: string; yLabel: string }) {
  const maxX = Math.max(30, Math.ceil(Math.max(...points.map((p) => p.x))));
  const maxY = Math.max(10, ...points.map((p) => p.y));
  const logMax = Math.log10(maxY);
  const sx = (x: number) => PAD.l + ((x - 1) / (maxX - 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - (Math.log10(Math.max(1, y)) / logMax) * (H - PAD.t - PAD.b);
  const yTicks = [1, 10, 100, 1_000, 10_000, 100_000].filter((t) => t <= maxY);
  const inBand = points.filter((p) => p.x >= band[0] && p.x <= band[1]).length;

  return (
    <figure className="mb-5 max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${points.length} queries by position and impressions; ${inBand} in positions ${band[0]}–${band[1]}`}>
        <rect x={sx(band[0])} y={PAD.t} width={sx(band[1]) - sx(band[0])} height={H - PAD.t - PAD.b} fill={TONE_HEX.primary} opacity={0.08} />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={TRACK_HEX} />
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} stroke={TRACK_HEX} strokeDasharray="2 4" />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="12" fill="#6B7280">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {[1, 4, 10, 20, maxX].map((t) => (
          <text key={t} x={sx(t)} y={H - PAD.b + 16} textAnchor="middle" fontSize="12" fill="#6B7280">
            {t}
          </text>
        ))}
        {points.map((p) => {
          const win = p.x >= band[0] && p.x <= band[1];
          return (
            <circle key={`${p.label}-${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={win ? 4 : 3} fill={win ? TONE_HEX.primary : TONE_HEX.info} fillOpacity={win ? 0.85 : 0.5}>
              <title>{`${p.label}: position ${p.x}, ${p.y.toLocaleString('en-US')} impressions`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-ink-3">
        <span>
          {xLabel} → · {yLabel} ↑ (log)
        </span>
        <span>
          Shaded: positions {band[0]}–{band[1]} · {inBand} {inBand === 1 ? 'query' : 'queries'}
        </span>
      </figcaption>
    </figure>
  );
}
