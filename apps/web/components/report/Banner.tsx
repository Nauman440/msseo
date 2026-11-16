import type { ReactNode } from 'react';
import { summaryHeadline, type Audience, type ReportModel } from '@seo/core';
import { buildSummary } from '@seo/core';
import { cn } from '@/lib/tones';

type Variant = 'alert' | 'warn' | 'good' | 'soft';

const STYLE: Record<Variant, { box: string; dot: string; title: string; body: string; icon: string }> = {
  // Red: critical issues. Orange: high-priority issues only. Green: neither. Soft: info/CTA.
  alert: { box: 'border-fail-text/15 bg-fail-bg', dot: 'bg-chart-fail text-white', title: 'text-fail-text', body: 'text-[#7F1D1D]', icon: '!' },
  warn: { box: 'border-high-text/15 bg-high-bg', dot: 'bg-chart-high text-white', title: 'text-high-text', body: 'text-[#7C2D12]', icon: '!' },
  good: { box: 'border-pass-text/15 bg-pass-bg', dot: 'bg-chart-pass text-white', title: 'text-pass-text', body: 'text-[#14532D]', icon: '✓' },
  soft: { box: 'border-primary/15 bg-primary-soft', dot: 'bg-primary text-primary-ink', title: 'text-primary-heading', body: 'text-primary-text', icon: 'i' },
};

export function Banner({ variant, title, children, action }: { variant: Variant; title: string; children?: ReactNode; action?: ReactNode }) {
  const s = STYLE[variant];
  return (
    <div
      role={variant === 'alert' ? 'alert' : undefined}
      className={cn('flex break-inside-avoid flex-col gap-4 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6', s.box)}
    >
      <div className="flex gap-3.5">
        <span aria-hidden="true" className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', s.dot)}>
          {s.icon}
        </span>
        <div>
          <p className={cn('font-display text-base font-semibold tracking-tight', s.title)}>{title}</p>
          {children && <div className={cn('mt-1 text-sm leading-6', s.body)}>{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** The summary banner at the top of every report: its tone follows the worst severity found. */
export function ReportBanner({ report, mode }: { report: ReportModel; mode: Audience }) {
  const head = summaryHeadline(report);
  return (
    <Banner variant={head.tone === 'critical' ? 'alert' : head.tone === 'high' ? 'warn' : 'good'} title={head.title}>
      {buildSummary(report)[mode]}
    </Banner>
  );
}
