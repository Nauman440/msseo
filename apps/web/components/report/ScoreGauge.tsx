import { TONE_HEX, cn, scoreTone } from '@/lib/tones';

const SWEEP = 0.75; // 270° arc, open at the bottom

export function ScoreGauge({
  score,
  label,
  size = 176,
  dark = false,
  caption = 'out of 100',
}: {
  score: number;
  label?: string;
  size?: number;
  dark?: boolean;
  caption?: string;
}) {
  const stroke = Math.round(size * 0.075);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * SWEEP;
  const value = arc * (Math.min(100, Math.max(0, score)) / 100);
  const tone = scoreTone(score);

  return (
    <figure className="flex flex-col items-center" aria-label={`Score ${score} out of 100${label ? `, ${label}` : ''}`}>
      <div className="relative" style={{ width: size, height: size * 0.86 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-x-0 top-0">
          <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={dark ? 'rgba(255,255,255,0.1)' : '#E6E3EF'}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${c}`}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={dark && tone === 'primary' ? '#B89BEE' : TONE_HEX[tone]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${value} ${c}`}
            />
          </g>
        </svg>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: size * 0.3 }}>
          <span
            className={cn('font-display font-bold leading-none tracking-display tabular', dark ? 'text-white' : 'text-ink')}
            style={{ fontSize: size * 0.3 }}
          >
            {score}
          </span>
          <span className={cn('mt-1.5 text-xs font-medium', dark ? 'text-white/50' : 'text-ink-3')}>{caption}</span>
        </div>
      </div>
      {label && (
        <figcaption
          className="-mt-1 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ color: TONE_HEX[tone], backgroundColor: `${TONE_HEX[tone]}${dark ? '33' : '14'}` }}
        >
          {label}
        </figcaption>
      )}
    </figure>
  );
}
