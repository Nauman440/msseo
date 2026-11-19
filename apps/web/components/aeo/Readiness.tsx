import type { AeoAudit, Signal } from '@seo/core';
import { CARD, CHIP, pathOf, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';

/** 10.1 crawler access, 10.6/10.7/10.10 signal lists, 10.8 accuracy, 10.9 snippet controls. */
const ok = (v: boolean | null, yes = 'OK', no = 'Fix') => <span className={cn(CHIP, v === null ? 'bg-sunken text-ink-2' : v ? 'bg-teal-chip text-teal-text' : 'bg-high-bg text-high-strong')}>{v === null ? 'Unclear' : v ? yes : no}</span>;

export function Crawlers({ a }: { a: AeoAudit }) {
  return (
    <section aria-labelledby="bots-title" className={CARD}>
      <h2 id="bots-title" className="font-display text-xl font-bold">Can AI crawlers read your site?</h2>
      {a.firewall && <p className="rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-text">{a.firewall.message}</p>}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr><th className={TH}>Crawler</th><th className={TH}>Used for</th><th className={TH}>robots.txt</th></tr></thead>
          <tbody>
            {a.crawlers.map((c) => (
              <tr key={c.bot}>
                <td className={cn(TD, 'font-semibold')}>{c.label}<span className="block text-[12px] font-normal text-ink-2">{c.bot}</span></td>
                <td className={cn(TD, 'text-ink-2')}>{c.purpose}</td>
                <td className={TD}>{ok(c.allowed, 'Allowed', 'Blocked')}{c.rule && <span className="ml-2 font-mono text-[12px] text-ink-2">{c.rule}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SignalList({ id, title, intro, signals }: { id: string; title: string; intro: string; signals: Signal[] }) {
  if (!signals.length) return null;
  return (
    <section aria-labelledby={`${id}-title`} className={CARD}>
      <h2 id={`${id}-title`} className="font-display text-xl font-bold">{title}</h2>
      <p className="text-sm text-ink-2">{intro}</p>
      <ul className="flex flex-col">
        {signals.map((s) => (
          <li key={s.id} className="flex items-start gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
            {ok(s.ok)}
            <span className="min-w-0"><b>{s.label}</b><span className="block text-[12.5px] text-ink-2">{s.detail}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Accuracy({ a }: { a: AeoAudit }) {
  const x = a.accuracy;
  if (!x) return null;
  return (
    <section aria-labelledby="acc-title" className={CARD}>
      <h2 id="acc-title" className="font-display text-xl font-bold">What AI says about your business</h2>
      <p className="text-sm text-ink-2">We asked: “{x.question}”. {x.summary}</p>
      {x.rows.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className={TH}>Fact</th><th className={TH}>AI says</th><th className={TH}>Correct</th><th className={TH}></th></tr></thead>
            <tbody>
              {x.rows.map((r) => (
                <tr key={r.topic}>
                  <td className={cn(TD, 'font-semibold')}>{r.topic}</td>
                  <td className={TD}>{r.aiSays}</td>
                  <td className={cn(TD, 'text-ink-2')}>{r.actual}</td>
                  <td className={TD}>{ok(r.ok, 'Right', 'Wrong')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold text-primary-heading">Read the full answer</summary>
        <p className="whitespace-pre-line text-ink-2">{x.answer}</p>
      </details>
    </section>
  );
}

export function Controls({ a }: { a: AeoAudit }) {
  return (
    <section aria-labelledby="ctl-title" className={CARD}>
      <h2 id="ctl-title" className="font-display text-xl font-bold">Snippet and AI controls</h2>
      {a.controls.length ? (
        <ul className="flex flex-col">
          {a.controls.map((c) => (
            <li key={`${c.url}-${c.issue}`} className="border-t border-border py-2.5 text-sm first:border-t-0">
              <b className="break-all">{pathOf(c.url)}</b>
              <span className="block text-[12.5px] text-ink-2">{c.issue}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No page stops Google or AI from quoting it (no nosnippet, short max-snippet or data-nosnippet found).</p>
      )}
    </section>
  );
}
