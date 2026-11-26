import { cn } from '@/lib/tones';

/** Small "New" tag next to a feature that was just added, so people notice it. */
export function NewTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-primary px-2 py-0.5 align-middle text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-primary-ink', className)}>
      New
    </span>
  );
}
