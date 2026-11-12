import type { Severity } from '@seo/core';
import { SEVERITY_LABEL, SEVERITY_TONE, TONE_HEX, TRACK_HEX } from '@/lib/tones';

type Counts = Record<Exclude<Severity, 'info'>, number>;

const ORDER: (keyof Counts)[] = ['critical', 'high', 'medium', 'low'];

export function SeverityDonut({ counts, size = 132 }: { counts: Counts; size?: number }) {
  const total = ORDER.reduce((sum, k) => sum + counts[k], 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 ? 3 : 0;

  let offset = 0;
  const arcs = ORDER.map((k) => {
    const len = total > 0 ? (counts[k] / total) * c : 0;
    const arc = { k, len: Math.max(0, len - gap), offset };
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} issues by severity`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK_HEX} strokeWidth={stroke} />
            {arcs.map((a) =>
              a.len > 0 ? (
                <circle
                  key={a.k}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={TONE_HEX[SEVERITY_TONE[a.k]]}
                  strokeWidth={stroke}
                  strokeDasharray={`${a.len} ${c}`}
                  strokeDashoffset={-a.offset}
                />
              ) : null,
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold tracking-display tabular">{total}</span>
          <span className="text-xs font-medium text-ink-3">issues</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {ORDER.map((k) => (
          <li key={k} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: TONE_HEX[SEVERITY_TONE[k]] }} />
              {SEVERITY_LABEL[k]}
            </span>
            <span className="font-semibold tabular">{counts[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
