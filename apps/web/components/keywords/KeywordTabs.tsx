import Link from 'next/link';
import { cn } from '@/lib/tones';

export type KeywordView = 'overview' | 'all' | 'questions' | 'inputs';
export const KEYWORD_VIEWS: KeywordView[] = ['overview', 'all', 'questions', 'inputs'];

/** Adds `view` (and other params) to the page's base URL. */
export function viewHref(base: string, view: KeywordView, extra: Record<string, string> = {}) {
  const [path, query = ''] = base.split('?');
  const qs = new URLSearchParams(query);
  if (view === 'overview') qs.delete('view');
  else qs.set('view', view);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path!;
}

/** Keyword sections (design: underline tabs with counts). */
export function KeywordTabs({ base, view, keywords, questions }: { base: string; view: KeywordView; keywords: number; questions: number }) {
  const tabs: { key: KeywordView; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'all', label: 'All keywords', count: keywords },
    { key: 'questions', label: 'Questions for AI', count: questions },
    { key: 'inputs', label: 'Research inputs' },
  ];
  return (
    <nav aria-label="Keyword sections" className="flex flex-wrap border-b border-border">
      {tabs.map((t) => {
        const active = t.key === view;
        return (
          <Link
            key={t.key}
            href={viewHref(base, t.key)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'mr-[22px] inline-flex min-h-11 items-center border-b-[3px] px-1 text-[15px]',
              active ? 'border-primary font-bold text-ink' : 'border-transparent font-medium text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cn('ml-1.5 text-[12px] font-bold tabular', active ? 'text-primary-heading' : 'text-ink-2')}>{t.count.toLocaleString('en-US')}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
