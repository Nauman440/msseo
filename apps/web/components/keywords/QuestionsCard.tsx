import type { KeywordWorkspace } from '@seo/core';
import { Card } from '@/components/ui/Card';

/**
 * "People also ask" questions Google shows for the checked keywords, grouped by topic: ready-made
 * FAQ material for the page that targets each topic (and for audit rule 2.8.2).
 */
export function QuestionsCard({ ws }: { ws: KeywordWorkspace }) {
  const questions = ws.questions ?? [];
  if (!questions.length) return null;
  const clusterOf = new Map(ws.keywords.map((k) => [k.term, k.clusterId]));
  const names = new Map(ws.clusters.map((c) => [c.id, c.name]));
  const groups = new Map<string, string[]>();
  for (const q of questions) {
    const id = clusterOf.get(q.keyword);
    const topic = (id && names.get(id)) || 'Other';
    groups.set(topic, [...(groups.get(topic) ?? []), q.text]);
  }
  return (
    <Card title="Questions people ask Google" eyebrow={`${questions.length} questions · "People also ask"`}>
      <p className="mb-4 text-sm text-ink-2">Answer these on the page for each topic, for example as an FAQ section. Short, direct answers can show up in Google and in AI answers.</p>
      <div className="flex flex-col gap-5">
        {[...groups].map(([topic, list]) => (
          <div key={topic}>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{topic}</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {list.map((q) => (
                <li key={q} className="text-[15px] text-ink">{q}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
