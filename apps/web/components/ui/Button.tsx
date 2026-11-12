import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/tones';

type Variant = 'primary' | 'secondary' | 'ghost-dark' | 'brand';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-ink hover:border-ink-3',
  'ghost-dark': 'border border-white/15 text-white hover:border-white/40 hover:bg-white/5',
  brand: 'bg-brand text-night hover:brightness-105',
};

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={cn(BASE, VARIANT[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(BASE, VARIANT[variant], className)} {...props} />;
}
