import type { MonthPoint } from '@seo/core';
import { TREND_HEX } from '@/lib/tones';

/** 12-month estimated traffic trend (3.8), tiny SVG; teal when it grew, red when it fell. */
export function Sparkline({ points, label }: { points: MonthPoint[] | null; label: string }) {
  if (!points || points.length < 2) return <span className="text-[13px] text-ink-3">–</span>;
  const W = 72;
  const H = 26;
  const max = Math.max(1, ...points.map((p) => p.etv));
  const min = Math.min(...points.map((p) => p.etv));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / Math.max(1, max - min)) * (H - 8);
  const d = points.map((p, i) => `${x(i).toFixed(1)},${y(p.etv).toFixed(1)}`).join(' ');
  const first = points[0]!.etv;
  const last = points[points.length - 1]!.etv;
  const up = last >= first;
  const change = first ? Math.round(((last - first) / first) * 100) : 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${up ? 'up' : 'down'} ${Math.abs(change)}% over 12 months`}>
      <polyline points={d} fill="none" stroke={up ? TREND_HEX.up : TREND_HEX.down} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
