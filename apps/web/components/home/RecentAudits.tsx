import Link from 'next/link';
import type { RecentAudit } from '@/lib/home-data';
import { formatDate } from '@/lib/reports';
import { TONE_HEX, cn, scoreTone } from '@/lib/tones';
import { TonePill } from '@/components/ui/Pills';

function ScoreCell({ audit }: { audit: RecentAudit }) {
  if (audit.status === 'running') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="h-1.5 w-16 overflow-hidden rounded-bar bg-chart-track">
          <span className="block h-full rounded-bar bg-primary" style={{ width: `${audit.progress ?? 0}%` }} />
        </span>
        <span className="text-xs font-medium text-ink-3 tabular">{audit.progress}%</span>
      </div>
    );
  }
  if (audit.score === null) return <span className="text-sm text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ backgroundColor: TONE_HEX[scoreTone(audit.score)] }} />
      <span className="font-display text-lg font-semibold tabular">{audit.score}</span>
    </span>
  );
}

const STATUS = {
  completed: { tone: 'pass', label: 'Completed' },
  running: { tone: 'primary', label: 'Running' },
  failed: { tone: 'fail', label: 'Failed' },
} as const;

export function RecentAudits({ audits }: { audits: RecentAudit[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <ul className="divide-y divide-border">
        {audits.map((a) => {
          const openable = Boolean(a.href);
          return (
            <li
              key={a.id}
              className={cn(
                'relative grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_128px_96px_104px_104px] sm:px-6',
                openable && 'transition-colors hover:bg-sunken/60',
              )}
            >
              <div className="min-w-0">
                {openable ? (
                  <Link href={a.href!} className="font-semibold after:absolute after:inset-0 hover:text-primary-text">
                    {a.project}
                  </Link>
                ) : (
                  <p className="font-semibold">{a.project}</p>
                )}
                <p className="truncate font-mono text-xs text-ink-3">{a.domain}</p>
              </div>
              <div className="sm:order-none">
                <ScoreCell audit={a} />
              </div>
              <span className="hidden text-[13px] text-ink-2 sm:block">
                {a.audience === 'client' ? 'Client' : 'SEO expert'}
              </span>
              <span className="hidden text-[13px] text-ink-2 tabular sm:block">{formatDate(a.date)}</span>
              <TonePill tone={STATUS[a.status].tone} className="col-span-2 w-fit sm:col-span-1 sm:justify-self-end">
                {STATUS[a.status].label}
              </TonePill>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
