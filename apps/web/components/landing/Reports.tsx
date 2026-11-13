import { cn } from '@/lib/tones';
import { Check } from './icons';
import { Container, CtaBlock, SectionHeader } from './primitives';

const CADENCES = [
  { tag: 'Daily', when: 'Every day', title: 'Alerts only when it matters', items: ['Site down or SSL problems', 'robots.txt or noindex changes', 'Sudden drops in clicks', 'New reviews and replies to approve'] },
  { tag: 'Weekly', when: 'Every week', title: 'Your progress summary', items: ['Changes made and awaiting approval', 'Results checked at 7, 14 and 28 days', 'AI search visibility score', 'Top 5 actions for next week'] },
  { tag: 'Monthly', when: 'Every month', title: 'Results you can show anyone', items: ['Clicks, calls and form leads from search', 'Rankings and map visibility', 'What worked and what did not', 'The plan for next month'] },
];

const ALERTS = [
  { label: 'Urgent', cls: 'bg-high-bg text-high-text', text: 'robots.txt changed. Review the difference now.' },
  { label: 'Notice', cls: 'bg-amber-bg text-amber-text', text: 'Organic clicks are 18% below the usual weekday level.' },
  { label: 'Good', cls: 'bg-pass-bg text-pass-text', text: 'New 5-star review received. Reply drafted for approval.' },
];

// Sample weekly clicks (share of the tallest bar), as drawn in the design.
const WEEKS = [52, 60, 56, 71, 79, 85, 83, 100];

export function Reports() {
  return (
    <section id="reports" className="scroll-mt-20 bg-surface py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader
          soon
          title="Daily alerts, weekly summaries and a monthly report"
          intro="Know what is happening without logging in. Short, plain-language updates that tell you what changed and what comes next."
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {CADENCES.map((c) => (
            <div key={c.tag} className="flex flex-col gap-3 rounded-panel border border-border p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-pill bg-primary-chip px-2.5 py-0.5 text-[13px] font-bold text-primary-heading">{c.tag}</span>
                <span className="text-[13px] text-ink-2">{c.when}</span>
              </div>
              <h3 className="font-display text-xl font-bold leading-tight">{c.title}</h3>
              <ul className="flex flex-col gap-2.5">
                {c.items.map((i) => (
                  <li key={i} className="flex gap-2.5 text-[15px]">
                    <Check />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col rounded-panel border border-border p-6">
            <div className="flex items-center justify-between gap-3 pb-3">
              <strong className="text-base">Sample daily alert</strong>
              <span className="rounded-pill bg-sunken px-2.5 py-0.5 text-[13px] font-bold text-ink-2">Only sent when needed</span>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {ALERTS.map((a) => (
                <li key={a.label} className="flex items-start gap-3 py-3.5 text-[15px]">
                  <span className={cn('shrink-0 rounded-pill px-2.5 py-0.5 text-[13px] font-bold', a.cls)}>{a.label}</span>
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
          <figure className="flex flex-col gap-4 rounded-panel border border-border p-6">
            <div className="flex items-center justify-between gap-3">
              <figcaption className="text-base font-bold">Sample weekly clicks from Google</figcaption>
              <span className="rounded-pill bg-sunken px-2.5 py-0.5 text-[13px] font-bold text-ink-2">Sample</span>
            </div>
            <div className="flex h-40 items-end gap-3 border-b border-border-strong px-2" role="img" aria-label="Sample chart: weekly clicks rising over eight weeks">
              {WEEKS.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center">
                  <div className={cn('w-full rounded-t-[4px]', i === WEEKS.length - 1 ? 'bg-teal' : 'bg-teal-soft')} style={{ height: `${h * 1.3}px` }} />
                </div>
              ))}
            </div>
            <div className="-mt-2 flex gap-3 px-2 text-[13px] text-ink-2" aria-hidden="true">
              {WEEKS.map((_, i) => (
                <span key={i} className="flex-1 text-center">
                  W{i + 1}
                </span>
              ))}
            </div>
          </figure>
        </div>
        <CtaBlock label="Start with a free audit" />
      </Container>
    </section>
  );
}
