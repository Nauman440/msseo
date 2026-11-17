import type { MonthPoint } from '@seo/core';
import { TONE_HEX } from '@/lib/tones';

/** 12-month estimated traffic trend (3.8), tiny SVG; green when it grew, red when it fell. */
export function Sparkline({ points, label }: { points: MonthPoint[] | null; label: string }) {
  if (!points || points.length < 2) return <span className="text-[13px] text-ink-3">–</span>;
  const W = 96;
  const H = 28;
  const max = Math.max(1, ...points.map((p) => p.etv));
  const min = Math.min(...points.map((p) => p.etv));
  const x = (i: number) => (i / (points.length - 1)) * (W - 2) + 1;
  const y = (v: number) => H - 2 - ((v - min) / Math.max(1, max - min)) * (H - 4);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.etv).toFixed(1)}`).join(' ');
  const first = points[0]!.etv;
  const last = points[points.length - 1]!.etv;
  const up = last >= first;
  const change = first ? Math.round(((last - first) / first) * 100) : 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${up ? 'up' : 'down'} ${Math.abs(change)}% over 12 months`}>
      <path d={d} fill="none" stroke={up ? TONE_HEX.pass : TONE_HEX.high} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
