import { ComingSoon, Container, CtaBlock, Panel, Section, SectionHeader } from './primitives';

const STEPS = [
  { n: 1, time: 'A few minutes', title: 'Run your free audit', body: 'Enter your website and get a health score with your top issues, ranked by what matters most.' },
  { n: 2, time: 'A few minutes', title: 'Approve the fixes', body: 'We prepare each change. You see the before and after, then approve one or all of them.', soon: true },
  { n: 3, time: 'Every week', title: 'Watch your results', body: 'We apply the changes, check them after 7, 14 and 28 days, and send you clear reports.', soon: true },
];

const FLOW = [
  { title: 'We find an issue', body: 'Each one has evidence and a clear explanation.' },
  { title: 'We prepare the exact change', body: 'You see the old and new version side by side.' },
  { title: 'You approve or skip', body: 'Approve one change, a group, or all of them.' },
  { title: 'We apply it and check the result', body: 'Results are measured after 7, 14 and 28 days. Anything that hurts is rolled back.' },
];

const GUARDED = ['robots.txt', 'noindex and canonical tags', 'Deleting or redirecting pages', 'Publishing new pages', 'Site migrations'];

const CHANGES = [
  { type: 'Title tag', path: '/services/ac-repair/', before: 'AC Repair', after: 'AC Repair in Islamabad | 24 Hour Service' },
  { type: 'Meta description', path: '/services/heat-pump/', before: '(missing)', after: 'Heat pump installation and repair by licensed technicians. Get a free quote today.' },
];

export function HowItWorks() {
  return (
    <Section id="how">
      <Container className="flex flex-col gap-9">
        <SectionHeader eyebrow="How it works" title="Three steps. A few minutes of your time." intro="We do the hard part. You stay in charge." />
        <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Panel className="h-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[44px] font-extrabold leading-none text-primary">{s.n}</span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {s.soon && <ComingSoon />}
                    <span className="rounded-pill bg-primary-chip px-2.5 py-1 text-xs font-bold text-primary-heading">{s.time}</span>
                  </span>
                </div>
                <h3 className="font-display text-[21px] font-bold">{s.title}</h3>
                <p className="text-[15px] leading-[1.6] text-ink-2">{s.body}</p>
              </Panel>
            </li>
          ))}
        </ol>
        <CtaBlock label="Start with step 1, it is free" />
      </Container>
    </Section>
  );
}

export function Approvals() {
  return (
    <section id="approvals" className="scroll-mt-20 bg-surface py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-9">
        <div className="flex flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <ComingSoon className="self-start" />
            <h2 className="font-display text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
              Nothing changes on your website without your approval
            </h2>
            <p className="text-[17px] leading-[1.55] text-ink-2">
              We prepare every fix. You see exactly what will change, then approve it. If you ever change your mind, one click puts the old version back.
            </p>
            <ol className="flex flex-col gap-4">
              {FLOW.map((f, i) => (
                <li key={f.title} className="flex gap-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-primary-ink">{i + 1}</span>
                  <span>
                    <strong className="block text-base font-bold">{f.title}</strong>
                    <span className="text-sm text-ink-2">{f.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[15px] font-bold">These always wait for your approval:</p>
            <ul className="flex flex-wrap gap-2">
              {GUARDED.map((g) => (
                <li key={g} className="rounded-pill bg-amber-bg px-2.5 py-1 text-[13px] font-bold text-amber-text">
                  {g}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-6 shadow-lift">
            <div className="flex items-center justify-between gap-3">
              <strong className="font-display text-[17px]">12 changes ready for your approval</strong>
              <span className="rounded-pill bg-sunken px-2.5 py-0.5 text-xs font-bold text-ink-2">Sample</span>
            </div>
            {CHANGES.map((c) => (
              <div key={c.path} className="flex flex-col gap-2 rounded-[14px] border border-border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-pill bg-primary-chip px-2.5 py-0.5 text-[13px] font-bold text-primary-heading">{c.type}</span>
                  <code className="text-xs text-ink-2">{c.path}</code>
                </div>
                <del className="text-[13px] text-ink-3">{c.before}</del>
                <p className="text-[15px] font-semibold">{c.after}</p>
                <div className="flex gap-2" aria-hidden="true">
                  <span className="inline-flex min-h-11 items-center rounded-control bg-primary px-[18px] text-[15px] font-bold text-primary-ink">Approve</span>
                  <span className="inline-flex min-h-11 items-center rounded-control border border-border-strong px-[18px] text-[15px]">Skip</span>
                </div>
              </div>
            ))}
            <span aria-hidden="true" className="flex min-h-12 items-center justify-center rounded-control bg-night text-base font-bold text-mist">Approve all 12</span>
            <p className="text-[13px] text-ink-2">Every change can be undone in one click.</p>
          </div>
        </div>
        <CtaBlock label="See the fixes for my website, free" />
      </Container>
    </section>
  );
}
