import type { KeywordWorkspace } from '@seo/core';

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
    <section aria-labelledby="paa" className="flex flex-col gap-3.5">
      <div className="mt-2 flex flex-col gap-1.5">
        <h2 id="paa" className="font-display text-[22px] font-bold">Questions people ask Google</h2>
        <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-2">
          {questions.length} questions from Google’s “People also ask”. Answer them on the page for each topic, for example in an FAQ section: short, direct answers can show up in Google and in AI answers.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {[...groups].map(([topic, list]) => (
          <section key={topic} aria-label={topic} className="rounded-card border border-border bg-surface px-[22px] py-5">
            <h3 className="text-[17px] font-bold">{topic}</h3>
            <ul className="mt-2">
              {list.map((q) => (
                <li key={q} className="border-t border-border py-2.5 text-[14.5px] leading-snug">{q}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
