import { SubTabs, withView } from '@/components/ui/SubTabs';

/** Two sections: the keywords (with their research inputs) and the page plan (Module 5). */
export type KeywordView = 'keywords' | 'mapping';
/** Folded parts of the Keywords section that a link can open: every keyword, the research inputs, the AI questions. */
export type KeywordOpen = 'all' | 'inputs' | 'questions' | null;

/** Adds `view` (and other params) to the keyword page's base URL. */
export const viewHref = (base: string, view: KeywordView, extra: Record<string, string> = {}) => withView(base, view, 'keywords', extra);

/**
 * Reads `?view=` and `?open=`. Older links still work: overview / all / inputs / questions land on Keywords
 * and open their part.
 */
const OPEN = ['all', 'inputs', 'questions'];
export function parseKeywordView(view?: string, open?: string): { view: KeywordView; open: KeywordOpen } {
  const o = (OPEN.includes(open ?? '') ? open : OPEN.includes(view ?? '') ? view : null) as KeywordOpen;
  return { view: view === 'mapping' ? 'mapping' : 'keywords', open: o };
}

export function KeywordTabs({ base, view, keywords, topics }: { base: string; view: KeywordView; keywords: number; topics: number }) {
  return (
    <SubTabs
      label="Keyword sections"
      active={view}
      tabs={[
        { key: 'keywords', label: 'Keywords', count: keywords, href: viewHref(base, 'keywords') },
        { key: 'mapping', label: 'Page plan', count: topics, href: viewHref(base, 'mapping') },
      ]}
    />
  );
}
