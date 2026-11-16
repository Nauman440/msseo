import { TONE_HEX, TRACK_HEX, scoreTone } from '@/lib/tones';

/** Small score ring for the signup sidebar and step 2 (design: "82%" in a green ring). */
export function MiniScore({ score, size = 52, onLight = false }: { score: number; size?: number; onLight?: boolean }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, score));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${value} out of 100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={onLight ? TRACK_HEX : '#2B3D57'} strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={TONE_HEX[scoreTone(value)]}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.27} fontWeight={700} fill={onLight ? '#0F1B2D' : '#FAF7F2'}>
        {value}
      </text>
    </svg>
  );
}
