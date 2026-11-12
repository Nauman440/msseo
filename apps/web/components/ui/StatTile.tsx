import { cn } from '@/lib/tones';

type Variant = 'sunken' | 'raised' | 'dark';

const FRAME: Record<Variant, string> = {
  sunken: 'bg-sunken',
  raised: 'border border-border bg-surface shadow-card',
  dark: 'border border-night-line bg-night-2',
};

export function StatTile({
  value,
  label,
  hint,
  variant = 'sunken',
}: {
  value: string;
  label: string;
  hint?: string;
  variant?: Variant;
}) {
  const dark = variant === 'dark';
  return (
    <div className={cn('rounded-tile p-4 sm:p-5', variant === 'raised' && 'rounded-card', FRAME[variant])}>
      <p className={cn('font-display text-[28px] font-semibold leading-none tracking-display tabular', dark ? 'text-white' : 'text-ink')}>
        {value}
      </p>
      <p className={cn('mt-2.5 text-[13px] font-medium', dark ? 'text-white/60' : 'text-ink-2')}>{label}</p>
      {hint && <p className={cn('mt-0.5 text-xs', dark ? 'text-white/40' : 'text-ink-3')}>{hint}</p>}
    </div>
  );
}
