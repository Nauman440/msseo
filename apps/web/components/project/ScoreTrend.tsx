import { TONE_HEX, TRACK_HEX } from '@/lib/tones';

/** Overall score per completed audit, oldest → newest (spec Phase 3 "score trend line"). Plain SVG. */
export type TrendPoint = { date: string; score: number; href: string };

const W = 380;
const H = 190;
const PAD = { l: 30, r: 12, t: 12, b: 26 };

export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-ink-2">The trend appears after the second completed audit of this site.</p>;
  }
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + (1 - s / 100) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const first = points[0]!.score;
  const last = points[points.length - 1]!.score;

  return (
    <figure className="max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Score went from ${first} to ${last} over ${points.length} audits`}>
        {[0, 50, 70, 90, 100].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={TRACK_HEX} strokeDasharray={t === 0 || t === 100 ? undefined : '2 4'} />
            {t !== 100 && (
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#6B7280">
                {t}
              </text>
            )}
          </g>
        ))}
        <path d={area} fill={TONE_HEX.primary} opacity={0.08} />
        <path d={line} fill="none" stroke={TONE_HEX.primary} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <a key={p.href} href={p.href}>
            <circle cx={x(i)} cy={y(p.score)} r={4.5} fill="#fff" stroke={TONE_HEX.primary} strokeWidth={2.5}>
              <title>{`${p.date}: ${p.score}`}</title>
            </circle>
          </a>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={`d-${p.href}`} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="12" fill="#6B7280">
              {p.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-2 text-[13px] text-ink-3 tabular">
        {points.length} completed audits · {first} → <strong className="text-ink">{last}</strong> ({last - first >= 0 ? '+' : ''}
        {last - first})
      </figcaption>
    </figure>
  );
}
