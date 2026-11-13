import { cn } from '@/lib/tones';

/* Hero "sample report preview" card from the homepage design (static illustration). */

const BARS = [
  { label: 'Technical SEO', value: 64, fill: 'bg-primary-hover' },
  { label: 'On-page SEO', value: 71, fill: 'bg-tick-light' },
  { label: 'Mobile', value: 80, fill: 'bg-chart-pass' },
  { label: 'AI search', value: 40, fill: 'bg-chart-high' },
];

const R = 54;
const CIRC = 2 * Math.PI * R;

export function SampleScore() {
  return (
    <figure className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-6 text-ink shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">SEO audit for yourdomain.com</strong>
        <span className="rounded-pill bg-primary-chip px-2.5 py-0.5 text-xs font-bold text-primary-text">46 issues</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <svg width="130" height="130" viewBox="0 0 140 140" role="img" aria-label="Sample SEO health score 72 percent" className="shrink-0">
          <circle cx="70" cy="70" r={R} fill="none" className="stroke-chart-track" strokeWidth="14" />
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            className="stroke-tick-light"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(CIRC * 0.72).toFixed(1)} ${CIRC.toFixed(1)}`}
            transform="rotate(-90 70 70)"
          />
          <text x="70" y="78" textAnchor="middle" className="fill-ink font-sans text-[30px] font-extrabold">
            72%
          </text>
        </svg>
        <ul className="flex min-w-[160px] flex-1 flex-col gap-2.5">
          {BARS.map((b) => (
            <li key={b.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-[13px]">
                <span>{b.label}</span>
                <strong className="tabular">{b.value}%</strong>
              </div>
              <div className="h-2 rounded-pill bg-chart-track">
                <div className={cn('h-2 rounded-pill', b.fill)} style={{ width: `${b.value}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="rounded-control bg-warn-bg p-3 text-[13px] text-fail-text">
        <strong>3 critical issues</strong> are hiding pages from Google. Fix them first.
      </p>
      <figcaption className="text-xs text-ink-2">Sample report preview</figcaption>
    </figure>
  );
}
