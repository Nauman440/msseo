import Link from 'next/link';
import type { ReactNode } from 'react';
import { AUDIT_HREF, CTA_NOTE } from '@/lib/site';
import { cn } from '@/lib/tones';

/* Shared building blocks of the landing page, mirroring the homepage design's values. */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-page px-4 sm:px-6', className)}>{children}</div>;
}

// cn() only joins classes, so each tone owns its padding and weight (no overrides).
const CHIP = {
  soft: 'bg-primary-chip px-3.5 py-1.5 font-bold text-primary-heading',
  navy: 'bg-night-3 px-3.5 py-1.5 font-bold text-primary-tint',
  solid: 'bg-primary px-3 py-[5px] font-extrabold text-primary-ink',
};

export function Chip({ tone = 'soft', children, className }: { tone?: keyof typeof CHIP; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex rounded-full text-[13px]', CHIP[tone], className)}>{children}</span>;
}

/** Marks a feature that is designed but not built yet (decision 2026-11-13). */
export function ComingSoon({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2.5 py-1 text-xs font-bold uppercase tracking-[0.06em]',
        dark ? 'bg-primary text-primary-ink' : 'bg-night text-mist',
        className,
      )}
    >
      Coming soon
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  intro,
  dark = false,
  align = 'center',
  soon = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  dark?: boolean;
  align?: 'center' | 'left';
  soon?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-3.5', align === 'center' ? 'items-center text-center' : 'items-start')}>
      {(eyebrow || soon) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {eyebrow && <Chip tone={dark ? 'navy' : 'soft'}>{eyebrow}</Chip>}
          {soon && <ComingSoon dark={dark} />}
        </div>
      )}
      <h2 className={cn('max-w-[820px] font-display text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[40px]', dark ? 'text-mist' : 'text-ink')}>
        {title}
      </h2>
      {intro && <p className={cn('max-w-[700px] text-[17px] leading-[1.6] sm:text-lg', dark ? 'text-mist-3' : 'text-ink-2')}>{intro}</p>}
    </div>
  );
}

// Each size owns padding, radius and type, since cn() cannot resolve conflicting classes.
const CTA_SIZE = {
  sm: 'min-h-[46px] rounded-control px-4 text-sm sm:px-[22px]',
  md: 'min-h-[46px] rounded-control px-[22px] text-[15px]',
  lg: 'min-h-[54px] rounded-button px-[30px] text-base',
};

/** Orange call-to-action into the audit tool (team-only for now). */
export function CtaLink({ children, href = AUDIT_HREF, size = 'lg', className }: { children: ReactNode; href?: string; size?: keyof typeof CTA_SIZE; className?: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        'inline-flex items-center justify-center bg-primary font-extrabold text-primary-ink transition-colors hover:bg-primary-hover',
        CTA_SIZE[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function CtaBlock({ label, dark = false, note = CTA_NOTE }: { label: string; dark?: boolean; note?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <CtaLink>{label}</CtaLink>
      {note && <p className={cn('text-sm', dark ? 'text-mist-3' : 'text-ink-2')}>{note}</p>}
    </div>
  );
}

/** White card used across sections (design: 1px #E7E2D8 border, 18px radius, 26px padding). */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 rounded-panel border border-border bg-surface p-[26px]', className)}>{children}</div>;
}

export function Section({ id, tone = 'canvas', children, className }: { id?: string; tone?: 'canvas' | 'white' | 'navy'; children: ReactNode; className?: string }) {
  const bg = tone === 'navy' ? 'bg-night' : tone === 'white' ? 'bg-surface' : 'bg-canvas';
  return (
    <section id={id} className={cn('scroll-mt-20 py-16 sm:py-[84px]', bg, className)}>
      {children}
    </section>
  );
}
