import type { CompetitorAnalysis } from '@seo/core';
import { cn } from '@/lib/tones';

/** 6.1.5 Searches you both rank for and you are higher (shown under "Searches you win"). */
const TH = 'whitespace-nowrap px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5';

export function Ahead({ a }: { a: CompetitorAnalysis }) {
  if (!a.ahead) return null;
  return (
    <section aria-labelledby="ahead-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="ahead-title" className="font-display text-xl font-bold">Searches where you are ahead</h2>
        <p className="mt-1 text-sm text-ink-2">You and a direct competitor both rank, and you are higher. Keep these pages fresh: they are the ones competitors will try to take.</p>
      </div>
      {a.ahead.length ? (
        <div className="relative max-h-[420px] overflow-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={TH}>Search</th>
                <th className={cn(TH, 'text-right')}>Searches / mo</th>
                <th className={cn(TH, 'text-right')}>You</th>
                <th className={TH}>Behind you</th>
              </tr>
            </thead>
            <tbody>
              {a.ahead.map((w) => (
                <tr key={w.keyword}>
                  <td className={cn(TD, 'font-semibold')}>{w.keyword}</td>
                  <td className={cn(TD, 'text-right tabular')}>{w.volume === null ? '–' : w.volume.toLocaleString('en-US')}</td>
                  <td className={cn(TD, 'text-right tabular font-bold text-teal-text')}>#{w.position}</td>
                  <td className={cn(TD, 'text-[13px] text-ink-2')}>{w.behind.map((b) => `${b.domain} (#${b.position})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-2">None yet: where you both rank, your direct competitors are higher.</p>
      )}
    </section>
  );
}
