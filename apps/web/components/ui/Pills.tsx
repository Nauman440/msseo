import type { RuleStatus, Severity, Tone } from '@seo/core';
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  TONE_SOFT,
  cn,
} from '@/lib/tones';

export function TonePill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-pill px-2 text-[11px] font-semibold uppercase tracking-[0.04em]',
        TONE_SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status, label }: { status: RuleStatus; label?: string }) {
  return (
    <TonePill tone={STATUS_TONE[status]} className="w-[52px] justify-center">
      {label ?? STATUS_LABEL[status]}
    </TonePill>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <TonePill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</TonePill>;
}

/** "3 issues", "38 errors" — coloured by the worst status it summarises. */
export function IssueBadge({ count, noun = 'issue', worst }: { count: number; noun?: string; worst: RuleStatus }) {
  if (count === 0) {
    return <TonePill tone="pass">All clear</TonePill>;
  }
  return (
    <span className={cn('inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold tabular', TONE_SOFT[STATUS_TONE[worst]])}>
      {count} {count === 1 ? noun : `${noun}s`}
    </span>
  );
}
