import type { KeywordInsights, KeywordMove } from '@seo/core';
import { NewTag } from '@/components/ui/NewTag';
import { cn } from '@/lib/tones';

/**
 * Keywords tab (FEATURE_KEYWORD_INSIGHTS): the verdict, then up to three moves, one per page to create or
 * improve, each with its demand, difficulty and position, a draft title, the sections to cover and why the
 * site can win it (who holds Google's first page). Map businesses come from the competitor searches.
 */
const num = (n: number) => n.toLocaleString('en-US');
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[96px] rounded-[10px] bg-canvas px-3 py-2">
      <dt className="text-[11.5px] font-semibold text-ink-2">{label}</dt>
      <dd className="font-display text-[17px] font-extrabold tabular">{value}</dd>
    </div>
  );
}

function Move({ m, n }: { m: KeywordMove; n: number }) {
  return (
    <li className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-extrabold text-white tabular">{n}</span>
        <div className="min-w-0">
          <h4 className="break-words text-[16px] font-bold">{m.topic}</h4>
          <p className="text-[13px] text-ink-2">
            {m.url ? <>Improve <span className="break-all font-mono text-[12.5px]">{path(m.url)}</span></> : <>Create a new page at <span className="break-all font-mono text-[12.5px]">{m.newPath}</span></>}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-2">
        <Fact label="Searches a month" value={num(m.demand)} />
        {m.localDemand !== null && m.localPlace && <Fact label={`In ${m.localPlace}`} value={num(m.localDemand)} />}
        <Fact label="How hard" value={m.difficulty === null ? 'unknown' : `${m.difficulty}/100`} />
        <Fact label="You on Google" value={m.position === null ? 'Not yet' : `#${Math.round(m.position)}`} />
      </dl>
      <div className="flex flex-col gap-1.5 text-[13.5px]">
        <p>
          <span className="font-semibold">Title: </span>
          {m.title}
        </p>
        {m.sections.length > 0 && (
          <div>
            <p className="font-semibold">Sections to cover:</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {m.sections.map((s) => (
                <li key={s} className="rounded-[8px] border border-border bg-canvas px-2 py-1 text-[12.5px]">{s}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-ink-2">
          <span className="font-semibold text-ink">Why: </span>
          {m.why}
        </p>
      </div>
    </li>
  );
}

export function KeywordInsightsCard({ insights }: { insights: KeywordInsights }) {
  return (
    <section aria-labelledby="kw-insights" className="flex flex-col gap-4 rounded-card border border-primary-tint bg-primary-wash p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="kw-insights" className="flex flex-wrap items-center gap-2 font-display text-xl font-bold">
          Your best moves right now <NewTag />
        </h2>
        <p className="text-[15px] font-semibold leading-relaxed">{insights.verdict}</p>
        <p className="text-[13px] text-ink-2">Ordered by how winnable each page is, not by search volume. Each move covers every keyword one page should rank for.</p>
      </div>
      {insights.moves.length > 0 && (
        <ol className={cn('grid grid-cols-1 gap-3', insights.moves.length > 1 && 'lg:grid-cols-3')}>
          {insights.moves.map((m, i) => (
            <Move key={m.clusterId} m={m} n={i + 1} />
          ))}
        </ol>
      )}
      {insights.mapBusinesses.length > 0 && (
        <p className="text-[13px] text-ink-2">
          <span className="font-semibold text-ink">In the map results for your main searches: </span>
          {insights.mapBusinesses.join(', ')}.
        </p>
      )}
    </section>
  );
}
