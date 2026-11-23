import { ASSISTANT_LABEL, type AeoWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { Answers, ShareOfVoice } from './Visibility';
import { Accuracy, Controls, Crawlers, SignalList } from './Readiness';
import { RunAeo } from './RunAeo';
import { Term } from '@/components/ui/Term';
import { TILE_TERMS } from '@/lib/glossary';

/** Module 10 · AI search page body, the same for the team and customers. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export function AeoView({ ws, audience, nextRun, questionsHref }: { ws: AeoWorkspace; audience: 'team' | 'customer'; nextRun: Date | null; questionsHref: string }) {
  const a = ws.audit;
  const you = a?.share.all.find((s) => s.you);
  const asked = a ? new Set(a.answers.map((x) => x.prompt)).size : 0;
  const tiles = a
    ? [
        { label: 'Share of voice', value: `${you?.share ?? 0}%`, hint: 'Your mentions of all brand mentions' },
        { label: 'Answers naming you', value: `${you?.mentions ?? 0} / ${a.answers.length}`, hint: `${asked} questions × ${Object.keys(ASSISTANT_LABEL).length} assistants` },
        { label: 'Answers linking to you', value: String(a.answers.filter((x) => x.cited.includes(ws.domain)).length), hint: 'Your site as a source' },
        { label: 'AI crawlers blocked', value: String(a.crawlers.filter((c) => !c.allowed).length), hint: 'In robots.txt', bad: a.crawlers.some((c) => !c.allowed) },
      ]
    : [];
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last check · ${day(a.runAt)}${audience === 'team' ? ` · $${a.costUsd.toFixed(2)}` : ''}` : 'Not checked yet'}</p>
          <p className="text-[15px] font-semibold">Do ChatGPT, Perplexity and Google’s AI answers name your business, and can AI read your site?</p>
          <p className="text-[13px] text-ink-2">
            Uses the questions ticked under <a href={questionsHref} className="font-semibold text-primary-heading underline">Keywords → Questions people ask AI</a> (up to 10). {audience === 'customer' ? 'Checked again every Monday.' : 'About $0.30–0.50 per run; customer sites are checked again every Monday.'}
          </p>
        </div>
        <RunAeo domain={ws.domain} again={Boolean(a)} disabledReason={nextRun ? `Next check available on ${nextRun.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.` : null} />
      </div>
      {a && (
        <>
          {a.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <ul aria-label="AI search summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((t) => (
              <li key={t.label} className={cn('rounded-[14px] border px-4 py-3.5', t.bad ? 'border-high-line bg-warn-bg' : 'border-border bg-surface')}>
                <p className={cn('font-display text-[24px] font-extrabold tabular', t.bad && 'text-high-strong')}>{t.value}</p>
                <p className="text-sm font-bold">{TILE_TERMS[t.label] ? <Term k={TILE_TERMS[t.label]!}>{t.label}</Term> : t.label}</p>
                <p className="text-[12px] text-ink-2">{t.hint}</p>
              </li>
            ))}
          </ul>
          <ShareOfVoice a={a} history={ws.history} />
          <Answers a={a} />
          <Crawlers a={a} />
          <SignalList id="entity" title="Signals that tell AI who you are" intro="Consistent name, business schema and profiles linked with sameAs." signals={a.entity} />
          <SignalList id="answer" title="Answer-ready content" intro="From the latest site audit (direct answers, FAQ, lists, credentials)." signals={a.answerReady.map((r) => ({ id: r.ruleId, label: r.label, ok: r.status === 'pass', detail: r.message }))} />
          <Accuracy a={a} />
          <Controls a={a} />
          <SignalList id="third" title="Where else AI can learn about you" intro="Reviews, listings and mentions on other websites." signals={a.thirdParty} />
        </>
      )}
    </div>
  );
}

