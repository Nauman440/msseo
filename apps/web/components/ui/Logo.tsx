import { cn } from '@/lib/tones';

/**
 * Placeholder wordmark until the official logo is dropped into /public/brand/.
 * Swap the <svg> for <Image src="/brand/logo.svg" /> once provided.
 */
export function Logo({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const text = tone === 'light' ? 'text-white' : 'text-ink';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#6D40BC" />
        <path
          d="M7 19V9.5l4.2 6 2.8-4 2.8 4 4.2-6V19"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21" cy="19" r="1.6" fill="#00E5BF" />
      </svg>
      <span className={cn('font-display text-[15px] font-semibold tracking-tight', text)}>
        Morosoft <span className="font-medium opacity-60">Audit</span>
      </span>
    </span>
  );
}
