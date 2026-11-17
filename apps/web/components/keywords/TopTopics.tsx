import type { KeywordCluster } from '@seo/core';

/** Customer summary: the few topics worth going after first, in plain words. */
const PAGE: Record<KeywordCluster['pageType'], string> = {
  home: 'your homepage',
  service: 'a service page',
  location: 'a page for that area',
  service_location: 'a service page for that city',
  blog_post: 'a helpful article',
  directory: 'listings on directories (Yelp, Angi…)',
};
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const path = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** Quick wins first (already close to the top), then by priority. */
export function topTopics(clusters: KeywordCluster[], n = 6): KeywordCluster[] {
  return [...clusters].sort((a, b) => Number(b.quickWin) - Number(a.quickWin) || b.priority - a.priority || b.volume - a.volume).slice(0, n);
}

export function TopTopics({ clusters }: { clusters: KeywordCluster[] }) {
  const top = topTopics(clusters);
  if (!top.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="top-topics">
      <h2 id="top-topics" className="font-display text-xl font-bold">Your top topics to go after</h2>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {top.map((c, i) => (
          <li key={c.id} className="flex gap-4 rounded-panel border border-border bg-surface p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night font-display text-sm font-bold text-mist tabular">{i + 1}</span>
            <div className="min-w-0">
              <h3 className="break-words font-display text-[17px] font-bold">{c.name}</h3>
              <p className="mt-0.5 text-[13px] text-ink-3 tabular">{c.volume.toLocaleString('en-US')} searches a month</p>
              <p className="mt-2 text-[15px] text-ink-2">
                {c.quickWin
                  ? `You are already #${c.bestPosition}${c.bestUrl ? ` with ${path(c.bestUrl)}` : ''}. Improving that page can move you onto the first screen.`
                  : c.bestPosition !== null && c.bestPosition <= 3
                    ? `You are in the top 3 (#${c.bestPosition}). Keep that page up to date.`
                    : `Not showing yet. Target it with ${PAGE[c.pageType]}.`}
                {c.seasonalDeadline ? ` Busy season: have it live by ${day(c.seasonalDeadline)}.` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
