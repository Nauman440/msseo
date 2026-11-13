import { AUDIT_HREF } from '@/lib/site';
import { cn } from '@/lib/tones';

const INPUT =
  'min-h-[54px] w-full rounded-control border-0 bg-surface px-4 text-base text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary';
const BUTTON =
  'min-h-[54px] shrink-0 rounded-button bg-primary px-[30px] text-base font-extrabold text-primary-ink transition-colors hover:bg-primary-hover';

/**
 * Website box from the homepage design. A plain GET form into the audit tool
 * (/audits/new?url=…), so it works without JavaScript. `layout`: 'row' puts the
 * button beside the input on wide screens, 'stack' puts it underneath.
 */
export function AuditForm({
  id,
  label,
  button,
  layout = 'row',
  hideLabel = false,
  className,
}: {
  id: string;
  label: string;
  button: string;
  layout?: 'row' | 'stack';
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <form action={AUDIT_HREF} method="get" className={cn('flex flex-col gap-3', layout === 'row' && 'sm:flex-row sm:items-end', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={id} className={cn('text-[13px] font-bold text-mist-2', hideLabel && 'sr-only')}>
          {label}
        </label>
        <input id={id} name="url" type="text" inputMode="url" autoComplete="url" required placeholder="https://yourdomain.com" className={INPUT} />
      </div>
      <button type="submit" className={cn(BUTTON, layout === 'stack' && 'w-full')}>
        {button}
      </button>
    </form>
  );
}
