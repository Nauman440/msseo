import type { BlogIdea } from '@seo/core';
import { Term } from '@/components/ui/Term';
import { CHIP, MONO } from './labels';

/**
 * Blog post ideas on the Page mapping tab: questions and "learn about" topics with no page yet, each
 * with its brief (.md) for a writer and the service page it should link to.
 */
const FIRST = 8;
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Idea({ domain, idea }: { domain: string; idea: BlogIdea }) {
  return (
    <li className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-[18px] py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 break-words text-[15px] font-bold">{idea.title}</h4>
        {idea.liveBy && <span className={`${CHIP} bg-amber-bg text-amber-text`}>Publish by {day(idea.liveBy)}</span>}
      </div>
      <p className="text-[13px] text-ink-2 tabular">
        Main keyword <strong className="text-ink">{idea.mainKeyword}</strong> · {idea.volume.toLocaleString('en-US')} searches a month
        {idea.trafficPotential ? ` · ~${idea.trafficPotential.toLocaleString('en-US')} visits a month for #1` : ''}
      </p>
      <p className="text-[13px] text-ink-2">
        Address <span className={MONO}>{idea.path}</span>
        {idea.linkTo && (
          <>
            {' '}· links to <span className={MONO}>{path(idea.linkTo)}</span>
          </>
        )}
      </p>
      {idea.faq.length > 0 && <p className="text-[12.5px] text-ink-2">{idea.faq.length} FAQ {idea.faq.length === 1 ? 'question' : 'questions'} from Google included</p>}
      <div>
        <a
          href={`/api/keywords/${domain}/blog-brief?id=${encodeURIComponent(idea.clusterId)}`}
          download
          className="inline-flex min-h-10 items-center rounded-button border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3"
        >
          Download brief (.md)
        </a>
      </div>
    </li>
  );
}

export function BlogIdeas({ domain, ideas }: { domain: string; ideas: BlogIdea[] }) {
  if (!ideas.length) return null;
  const first = ideas.slice(0, FIRST);
  const rest = ideas.slice(FIRST);
  return (
    <section aria-labelledby="blog-ideas" className="flex flex-col gap-3">
      <div>
        <h3 id="blog-ideas" className="font-display text-xl font-bold">
          Blog post ideas <span className="tabular text-ink-2">({ideas.length})</span>
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Questions your customers search for that no page answers yet. Each article answers one, then sends readers to your service page. Ranked by{' '}
          <Term k="priority">priority</Term> and <Term k="trafficPotential">traffic potential</Term>.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {first.map((i) => (
          <Idea key={i.clusterId} domain={domain} idea={i} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary-heading underline">Show {rest.length} more</summary>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {rest.map((i) => (
              <Idea key={i.clusterId} domain={domain} idea={i} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
