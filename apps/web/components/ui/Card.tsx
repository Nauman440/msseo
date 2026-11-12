import type { ReactNode } from 'react';
import { cn } from '@/lib/tones';

export function Card({
  title,
  eyebrow,
  badge,
  children,
  className,
}: {
  title?: string;
  eyebrow?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 break-inside-avoid rounded-card border border-border bg-surface p-6 shadow-card sm:p-7',
        className,
      )}
    >
      {(title || badge) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                {eyebrow}
              </p>
            )}
            {title && <h3 className="font-display text-[17px] font-semibold tracking-tight">{title}</h3>}
          </div>
          {badge}
        </header>
      )}
      {children}
    </section>
  );
}
