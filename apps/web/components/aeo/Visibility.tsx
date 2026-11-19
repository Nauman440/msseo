import { ASSISTANT_LABEL, type AeoAudit, type AeoHistoryPoint, type Assistant } from '@seo/core';
import { CARD, CHIP, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';

/** 10.2–10.5 share of voice (with the weekly trend), answers per assistant, cited sources. */
const ASSISTANTS = Object.keys(ASSISTANT_LABEL) as Assistant[];

function Trend({ history }: { history: AeoHistoryPoint[] }) {
  if (history.length < 2) return <p className="text-[13px] text-ink-2">The trend line appears after the second weekly check.</p>;
  const first = history[0]!;
  const last = history[history.length - 1]!;
  const w = 600;
  const h = 120;
  const max = Math.max(10, ...history.map((p) => p.you));
  const pts = history.map((p, i) => `${(i / (history.length - 1)) * w},${h - (p.you / max) * (h - 10) - 5}`).join(' ');
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[120px] w-full" role="img" aria-label={`Your share of voice over ${history.length} checks, latest ${last.you}%`}>
        <line x1="0" x2={w} y1={h - 5} y2={h - 5} className="stroke-chart-neutral" strokeWidth="1" />
        <polyline points={pts} fill="none" className="stroke-chart-primary" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[12px] text-ink-2"><span>{first.date}</span><span>{last.date}</span></figcaption>
    </figure>
  );
}

export function ShareOfVoice({ a, history }: { a: AeoAudit; history: AeoHistoryPoint[] }) {
  const rows = a.share.all;
  return (
    <section aria-labelledby="sov-title" className={CARD}>
      <h2 id="sov-title" className="font-display text-xl font-bold">Share of voice in AI answers</h2>
      <p className="text-sm text-ink-2">How often each business is named, out of all the businesses named in the answers.</p>
      {rows.length < 2 && <p className="rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-text">No competitors to compare with yet: shortlist competitors (Competitors tab) so share of voice shows who AI names instead of you.</p>}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th className={TH}>Business</th>
              <th className={cn(TH, 'text-right')}>All</th>
              {ASSISTANTS.map((x) => <th key={x} className={cn(TH, 'text-right')}>{ASSISTANT_LABEL[x]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain} className={cn(r.you && 'bg-primary-wash')}>
                <td className={cn(TD, 'break-all font-semibold')}>{r.you ? `You · ${r.domain}` : r.domain}</td>
                <td className={cn(TD, 'text-right tabular font-bold')}>{r.share}% <span className="font-normal text-ink-2">({r.mentions})</span></td>
                {ASSISTANTS.map((x) => <td key={x} className={cn(TD, 'text-right tabular')}>{a.share[x].find((s) => s.domain === r.domain)?.share ?? 0}%</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Trend history={history} />
      {a.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Websites the assistants cite</h3>
          <p className="text-[13px] text-ink-2">Getting listed or mentioned on these sites is the fastest way into AI answers.</p>
          <ul className="flex flex-wrap gap-2">
            {a.sources.map((s) => (
              <li key={s.domain} className={cn(CHIP, s.domain === a.domain ? 'bg-teal-chip text-teal-text' : 'bg-sunken text-ink-2')}>{s.domain} · {s.count}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Answers({ a }: { a: AeoAudit }) {
  if (!a.answers.length) return null;
  const questions = [...new Set(a.answers.map((x) => x.prompt))];
  return (
    <section aria-labelledby="ans-title" className={CARD}>
      <h2 id="ans-title" className="font-display text-xl font-bold">Question by question</h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className={TH}>Question</th>
              {ASSISTANTS.map((x) => <th key={x} className={TH}>{ASSISTANT_LABEL[x]}</th>)}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q}>
                <td className={cn(TD, 'max-w-[300px] font-semibold')}>{q}</td>
                {ASSISTANTS.map((x) => {
                  const r = a.answers.find((y) => y.prompt === q && y.assistant === x);
                  const you = r?.mentioned.includes(a.domain);
                  const label = !r || r.error ? 'Failed' : !r.shown ? 'No AI answer' : you ? (r.cited.includes(a.domain) ? 'Named + linked' : 'Named') : r.mentioned.length ? `Names ${r.mentioned.length} rival${r.mentioned.length > 1 ? 's' : ''}` : 'Not named';
                  return (
                    <td key={x} className={TD} title={r?.mentioned.length ? `Named: ${r.mentioned.join(', ')}` : undefined}>
                      <span className={cn(CHIP, you ? 'bg-teal-chip text-teal-text' : r?.mentioned.length ? 'bg-high-bg text-high-strong' : 'bg-sunken text-ink-2')}>{label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
