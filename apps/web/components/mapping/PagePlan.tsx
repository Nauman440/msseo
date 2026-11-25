import { normUrl, pageCards, pageNameOf, titleSuffix, type BlogIdea, type FastResult, type KeywordRecord, type MappingWorkspace, type ReportPage } from '@seo/core';
import { FastPageCard } from './FastPageCard';
import { SendAllBar } from './forms';
import { PagePlanCard, Volume } from './PagePlanCard';

/**
 * Keywords → Page plan, simple view (design 2026-11-25): one card per page (`pageCards()`: homepage,
 * about and shop first, topics on one page or repeating each other merged) with its primary, secondary
 * and informational keywords, then the questions to answer in blog posts and one bar to send
 * everything for approval. The expert view (MappingOverview) keeps conflicts, matching and the inventory.
 */
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "11 changes and 2 new pages are waiting for you", leaving out a part that is zero. */
const waiting = (changes: number, pages: number) => {
  const parts = [changes ? plural(changes, 'change', 'changes') : '', pages ? plural(pages, 'new page', 'new pages') : ''].filter(Boolean);
  return `${parts.join(' and ')} ${changes + pages === 1 ? 'is' : 'are'} waiting for you`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STEPS = [
  { title: 'One page per search', text: 'Each search goes to one page, so your pages never compete with each other.' },
  { title: 'Right words, right places', text: 'We put the search in the page title, heading and text, so Google knows what the page is about.' },
  { title: 'You approve first', text: 'Nothing changes on your website until you say yes.' },
];

export function PagePlan({ ws, keywords, places, fixes, reportPages, ideas, href, fast }: {
  ws: MappingWorkspace;
  /** The fast keyword pipeline's saved result: when present the plan shows its topics (same as the Keywords tab). */
  fast?: FastResult | null;
  keywords: KeywordRecord[];
  /** Places served (research inputs). */
  places: string[];
  fixes: Record<string, number>;
  reportPages: ReportPage[];
  ideas: BlogIdea[];
  href: (extra?: Record<string, string>) => string;
}) {
  const suffix = titleSuffix(reportPages);
  const byUrl = new Map(reportPages.map((p) => [normUrl(p.url), p]));
  const cards = fast ? [] : pageCards(ws, keywords, reportPages, places);
  // Live pages first, then pages and articles to create (each list by value, as saved).
  const fastTopics = fast ? [...fast.topics].sort((a, b) => Number(a.isNew) - Number(b.isNew)) : [];
  const close = fast
    ? fastTopics.filter((t) => !t.isNew && t.position !== null && t.position > 3 && t.position <= 30).length
    : cards.filter((c) => c.url && c.rows[0]!.currentPosition !== null && c.rows[0]!.currentPosition > 3 && c.rows[0]!.currentPosition <= 30).length;
  const newPages = fast ? fastTopics.filter((t) => t.isNew).length : cards.filter((c) => !c.url).length;
  const fixesOf = (c: (typeof cards)[number]) => c.rows.reduce((sum, r) => sum + (fixes[r.clusterId] ?? 0), 0);
  const totalFixes = fast ? fastTopics.filter((t) => !t.isNew).reduce((sum, t) => sum + (fixes[t.id] ?? 0), 0) : cards.filter((c) => c.url).reduce((sum, c) => sum + fixesOf(c), 0);
  const tiles = [
    { value: fast ? fastTopics.length : cards.length, label: 'pages in the plan' },
    { value: close, label: 'close to page 1' },
    { value: newPages, label: 'new pages to create' },
  ];
  const linkName = (u: string | null) => (u ? pageNameOf(byUrl.get(normUrl(u)) ?? { url: u }, suffix) : null);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[680px] flex-col gap-1.5">
        <h2 className="font-display text-[24px] font-bold sm:text-[28px]">Your page plan</h2>
        <p className="text-[15px] leading-relaxed text-ink-2">
          Each page on your site has one main search to win. When the right page has the right words, Google is more likely to show it to people ready to buy.
        </p>
      </div>

      <ul aria-label="Page plan summary" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <li key={t.label} className="min-w-0 rounded-[14px] border border-border bg-surface px-3 py-3 sm:px-[18px] sm:py-4">
            <p className="font-display text-[24px] font-extrabold tabular sm:text-[30px]">{t.value}</p>
            <p className="text-[12.5px] text-ink-2 sm:text-[13.5px]">{t.label}</p>
          </li>
        ))}
      </ul>

      <ol className="grid grid-cols-1 gap-4 rounded-card border border-border bg-surface px-5 py-[18px] md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-chip text-[13px] font-bold text-primary-heading">{i + 1}</span>
            <span>
              <span className="block text-[14.5px] font-bold">{s.title}</span>
              <span className="block text-[13px] text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      {fast ? (
        fastTopics.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-[15px] text-ink-2">No page plan yet. It is made automatically once your keywords are checked.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fastTopics.map((t) => (
              <FastPageCard key={t.id} t={t} fixes={fixes[t.id] ?? 0} href={href({ topic: t.id })} />
            ))}
          </div>
        )
      ) : cards.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-[15px] text-ink-2">
          No page plan yet. It is made automatically once your keywords are researched and your site has been checked.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map((c) => (
            <PagePlanCard
              key={c.key}
              card={c}
              name={c.url ? linkName(c.url)! : cap(c.rows[0]!.topic)}
              path={c.url ? path(c.url) : (c.suggestedPath ?? '')}
              fixes={fixesOf(c)}
              href={href({ topic: c.rows[0]!.clusterId })}
            />
          ))}
        </div>
      )}

      {ideas.length > 0 && (
        <section aria-labelledby="blog-questions" className="rounded-card border border-border bg-surface px-5 py-[18px]">
          <h3 id="blog-questions" className="font-display text-[19px] font-bold">Questions to answer in blog posts</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">People asking these are learning, not buying yet. A short post answers them and points to your main page.</p>
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {ideas.slice(0, 8).map((i) => (
              <li key={i.clusterId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <strong className="min-w-0 flex-1 break-words text-[14.5px]">“{i.mainKeyword}”</strong>
                <span className="flex flex-wrap items-center gap-3">
                  <Volume volume={i.volume} />
                  {i.linkTo && <span className="text-[12.5px] text-ink-2">Links to {linkName(i.linkTo)}</span>}
                  <a href={`/api/keywords/${ws.domain}/blog-brief?id=${encodeURIComponent(i.clusterId)}`} download className="inline-flex min-h-10 items-center rounded-button border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
                    Write post
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(totalFixes > 0 || newPages > 0) && (
        <SendAllBar
          domain={ws.domain}
          conflicts={0}
          fixes={totalFixes}
          message={waiting(totalFixes, newPages)}
          label="Send all for approval"
          sticky={false}
        />
      )}
    </div>
  );
}
