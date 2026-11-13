import { cn } from '@/lib/tones';

/**
 * Product wordmark "MSScore", optionally with "by Morosoft" (brand decision 2026-11-13).
 * `tone` is the text colour: 'dark' on light surfaces, 'light' on navy.
 */
export function Wordmark({ tone = 'dark', byline = true, className }: { tone?: 'dark' | 'light'; byline?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className={cn('text-xl font-extrabold tracking-[-0.02em]', tone === 'dark' ? 'text-ink' : 'text-mist')}>MSScore</span>
      {byline && (
        <span className={cn('text-xs font-semibold', tone === 'dark' ? 'text-ink-3' : 'text-mist-3')}>by Morosoft</span>
      )}
    </span>
  );
}
