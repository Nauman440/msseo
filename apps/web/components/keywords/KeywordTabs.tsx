import { SubTabs, withView } from '@/components/ui/SubTabs';

export type KeywordView = 'overview' | 'all' | 'mapping' | 'questions' | 'inputs';
export const KEYWORD_VIEWS: KeywordView[] = ['overview', 'all', 'mapping', 'questions', 'inputs'];

/** Adds `view` (and other params) to the keyword page's base URL. */
export const viewHref = (base: string, view: KeywordView, extra: Record<string, string> = {}) => withView(base, view, 'overview', extra);

/** Keyword sections (design: underline tabs with counts). */
export function KeywordTabs({ base, view, keywords, topics, questions }: { base: string; view: KeywordView; keywords: number; topics: number; questions: number }) {
  return (
    <SubTabs
      label="Keyword sections"
      active={view}
      tabs={[
        { key: 'overview', label: 'Overview', href: viewHref(base, 'overview') },
        { key: 'all', label: 'All keywords', count: keywords, href: viewHref(base, 'all') },
        { key: 'mapping', label: 'Page mapping', count: topics, href: viewHref(base, 'mapping') },
        { key: 'questions', label: 'Questions for AI', count: questions, href: viewHref(base, 'questions') },
        { key: 'inputs', label: 'Research inputs', href: viewHref(base, 'inputs') },
      ]}
    />
  );
}
