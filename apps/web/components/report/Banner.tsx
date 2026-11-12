import type { ReactNode } from 'react';
import { cn } from '@/lib/tones';

/** `alert` = red hero summary; `soft` = violet CTA banner (sales variant is feature-flagged). */
export function Banner({
  variant,
  title,
  children,
  action,
}: {
  variant: 'alert' | 'soft';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const alert = variant === 'alert';
  return (
    <div
      role={alert ? 'alert' : undefined}
      className={cn(
        'flex break-inside-avoid flex-col gap-4 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6',
        alert ? 'border-fail-text/15 bg-fail-bg' : 'border-primary/15 bg-primary-soft',
      )}
    >
      <div className="flex gap-3.5">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
            alert ? 'bg-chart-red' : 'bg-primary',
          )}
        >
          {alert ? '!' : 'i'}
        </span>
        <div>
          <p className={cn('font-display text-base font-semibold tracking-tight', alert ? 'text-fail-text' : 'text-primary-heading')}>
            {title}
          </p>
          {children && <div className={cn('mt-1 text-sm leading-6', alert ? 'text-[#7F1D1D]' : 'text-primary-text')}>{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}
