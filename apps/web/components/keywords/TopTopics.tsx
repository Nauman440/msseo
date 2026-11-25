import type { KeywordCluster } from '@seo/core';
import { PAGE_TO_MAKE } from './labels';

/** Customer summary (design "Your top topics to go after"): the topics worth going after first, in plain words. */
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Quick wins first (already close to the top), then by priority. */
export function topTopics(clusters: KeywordCluster[], n = 6): KeywordCluster[] {
  return [...clusters].sort((a, b) => Number(b.quickWin) - Number(a.quickWin) || b.priority - a.priority || b.volume - a.volume).slice(0, n);
}

/** "Busy season now: publish this week" once the publish-by date has passed but the peak is still ahead. */
function season(c: KeywordCluster, now: Date): string | null {
  if (!c.seasonalDeadline || !c.seasonalPeak) return null;
  const deadline = Date.parse(`${c.seasonalDeadline}T00:00:00Z`);
  if (deadline > now.getTime()) return `Busy season: live by ${longDay(c.seasonalDeadline)}`;
  const monthsToPeak = (c.seasonalPeak - 1 - now.getUTCMonth() + 12) % 12;
  return monthsToPeak <= 2 ? 'Busy season now: publish this week' : null;
}

function status(c: KeywordCluster): { line: string; todo: string } {
  const lower = c.head.toLowerCase();
  if (c.bestPosition === null || c.bestPosition > 100) return { line: 'Not showing yet', todo: `${PAGE_TO_MAKE[c.pageType]} ${lower}.` };
  if (c.bestPosition <= 3) return { line: `Ranking #${c.bestPosition} · top 3`, todo: 'Keep that page up to date and answer the questions people ask.' };
  if (c.quickWin) return { line: `Ranking #${c.bestPosition} · quick win`, todo: 'Improve the page that ranks: a clearer title, a short direct answer near the top and links from more of your pages.' };
  return { line: `Ranking #${c.bestPosition}`, todo: 'Add the sections the top results cover, such as costs, options and FAQs.' };
}

export function TopTopics({ clusters, now = new Date() }: { clusters: KeywordCluster[]; now?: Date }) {
  const top = topTopics(clusters);
  if (!top.length) return null;
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="top-topics">
      <div className="flex flex-col gap-1.5">
        <h2 id="top-topics" className="font-display text-[22px] font-bold tracking-[-0.01em] sm:text-[26px]">Start here: your best chances to win customers</h2>
        <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-2">The {top.length === 1 ? 'topic' : `${top.length} topics`} most likely to bring you customers soon, and what to do about each. The Page plan tab turns them into changes to your pages.</p>
      </div>
      <ol className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {top.map((c, i) => {
          const s = status(c);
          const busy = season(c, now);
          return (
            <li key={c.id} className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-5">
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-night text-sm font-extrabold text-white tabular">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="break-words text-[17px] font-bold">{c.name}</h3>
                  <p className="mt-0.5 text-[13px] text-ink-2 tabular">{c.volume.toLocaleString('en-US')} searches a month{c.trafficPotential ? ` · ~${c.trafficPotential.toLocaleString('en-US')} visits a month for #1` : ''}</p>
                </div>
              </div>
              <p className="text-sm font-semibold">{s.line}</p>
              <p className="text-sm leading-normal text-ink-2">{s.todo}</p>
              {busy && <p className="self-start rounded-[8px] bg-amber-bg px-2.5 py-1.5 text-[12px] font-bold text-amber-text">{busy}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
