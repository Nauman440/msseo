import Link from 'next/link';
import { cn } from '@/lib/tones';

export type SubTab = { key: string; label: string; href: string; count?: number };

/** Underline section tabs with counts (Keywords and Competitors designs). */
export function SubTabs({ label, tabs, active }: { label: string; tabs: SubTab[]; active: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap border-b border-border">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn('mr-[22px] inline-flex min-h-11 items-center border-b-[3px] px-1 text-[15px]', on ? 'border-primary font-bold text-ink' : 'border-transparent font-medium text-ink-2 hover:text-ink')}
          >
            {t.label}
            {t.count !== undefined && <span className={cn('ml-1.5 text-[12px] font-bold tabular', on ? 'text-primary-heading' : 'text-ink-2')}>{t.count.toLocaleString('en-US')}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Adds `view` (and other params) to a page's base URL; the default view drops it. */
export function withView(base: string, view: string, defaultView: string, extra: Record<string, string> = {}) {
  const [path, query = ''] = base.split('?');
  const qs = new URLSearchParams(query);
  if (view === defaultView) qs.delete('view');
  else qs.set('view', view);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path!;
}
