import type { CompetitorAnalysis } from '@seo/core';
import { cn } from '@/lib/tones';

/** 6.6 The tracked questions asked in ChatGPT: who was mentioned, and which sites it cited. */
export function AiAnswers({ a }: { a: CompetitorAnalysis }) {
  if (!a.ai) return null;
  const you = a.sites.find((s) => s.role === 'you')!.domain;
  return (
    <section aria-labelledby="ai-title" className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="ai-title" className="font-display text-xl font-bold">What ChatGPT recommends</h2>
        <p className="mt-1 text-sm text-ink-2">Your ticked questions for AI, asked in ChatGPT with web search on. Mentioned = named in the answer; sources = the pages it linked to.</p>
      </div>
      <ul className="flex flex-col">
        {a.ai.rows.map((r) => (
          <li key={r.prompt} className="flex flex-col gap-1.5 border-t border-border py-3">
            <p className="text-[14.5px] font-semibold leading-snug">{r.prompt}</p>
            {r.error ? (
              <p className="text-[13px] text-ink-3">No answer this time.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="text-ink-2">Mentioned:</span>
                {r.mentioned.length ? (
                  r.mentioned.map((d) => (
                    <span key={d} className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', d === you ? 'bg-primary text-primary-ink' : 'bg-sunken text-ink')}>{d === you ? 'You' : d}</span>
                  ))
                ) : (
                  <span className="text-ink-3">none of you</span>
                )}
                {r.cited.length > 0 && <span className="ml-2 text-ink-2">Sources: {r.cited.slice(0, 5).join(', ')}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {a.ai.sources.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-[15px] font-bold">Sources ChatGPT cites</h3>
          <p className="text-[13px] text-ink-2">Being listed or mentioned on these sites makes it more likely that AI assistants recommend you.</p>
          <ul className="flex flex-wrap gap-2">
            {a.ai.sources.map((s) => (
              <li key={s.domain} className="rounded-full border border-border bg-canvas px-3 py-1 text-[13px] font-semibold">
                {s.domain} <span className="font-normal text-ink-2 tabular">· {s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.ai.formats && a.ai.formats.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-[15px] font-bold">How ChatGPT shapes its answers</h3>
          <p className="text-[13px] text-ink-2">Write your key pages the same way (steps, lists, short direct answers), so they are easy for AI to quote.</p>
          <ul className="flex flex-wrap gap-2">
            {a.ai.formats.map((f) => (
              <li key={f.format} className="rounded-full border border-border bg-canvas px-3 py-1 text-[13px] font-semibold">
                {f.format} <span className="font-normal text-ink-2 tabular">· {f.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 6.7 Five recommendations, grounded in the numbers. No md:/lg: classes (PDF). */
export function Recommendations({ a }: { a: CompetitorAnalysis }) {
  return (
    <section aria-labelledby="recs-title" className="pdf-avoid flex flex-col gap-3.5 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="recs-title" className="font-display text-xl font-bold">Five things to do to beat them</h2>
        <p className="mt-1 text-sm text-ink-2">{a.recommendationsBy === 'ai' ? 'Written by AI from the numbers in this analysis.' : 'Worked out from the numbers in this analysis.'}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {a.recommendations.map((r, i) => (
          <li key={r.title} className="pdf-avoid flex gap-3.5 rounded-[14px] border border-border p-4">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-night text-sm font-extrabold text-white tabular">{i + 1}</span>
            <div className="min-w-0">
              <h3 className="text-base font-bold">{r.title}</h3>
              <p className="mt-1 text-sm leading-normal text-ink-2">{r.why}</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                {r.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
