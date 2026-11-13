import { cn } from '@/lib/tones';

/** Stroke icons from the homepage design (24×24, 2px stroke, currentColor). */
const PATHS = {
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14zM8 11h6',
  lines: 'M4 6h16M4 12h10M4 18h7',
  bolt: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
  chat: 'M8 10h8M8 14h5M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-6l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  phone:
    'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.5-8 9-4.6-.5-8-4.5-8-9V6zM9 12l2 2 4-4',
  bars: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  doc: 'M4 4h16v16H4zM8 9h8M8 13h5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-6', className)}>
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 50px soft-orange tile holding an icon (design: #FFF1E6 tile, #C2410C stroke). */
export function IconTile({ name }: { name: IconName }) {
  return (
    <span className="flex size-[50px] shrink-0 items-center justify-center rounded-[14px] bg-primary-soft text-primary-text">
      <Icon name={name} />
    </span>
  );
}

/** Tick mark. `tone`: 'tick' on navy, 'pass' in light lists, 'teal' in "fixed" boxes. */
export function Check({ tone = 'pass', className }: { tone?: 'tick' | 'pass' | 'teal'; className?: string }) {
  const color = tone === 'tick' ? 'text-tick' : tone === 'teal' ? 'text-tick-light' : 'text-chart-pass';
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', color, className)}>
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cross() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-high-text">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
