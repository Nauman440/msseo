import { cn } from '@/lib/tones';
import { Container, CtaBlock, Panel, SectionHeader } from './primitives';

const QUESTION = 'Who is the best AC repair company in [your city]?';

const STEPS = [
  { title: 'Track', body: 'We ask AI assistants the questions your customers ask, every week, and record who they recommend.' },
  { title: 'Fix', body: 'Allow AI crawlers, add schema markup, and make your key pages easy for assistants to quote.' },
  { title: 'Strengthen', body: 'Add clear answers, FAQs, reviews and trust signals, and build presence on sites AI assistants rely on.' },
  { title: 'Measure', body: 'Your AI visibility score and the sources AI uses show whether you are being mentioned more.' },
];

function Exchange({ after }: { after: boolean }) {
  return (
    <div className={cn('flex flex-col gap-3.5 rounded-[20px] bg-surface p-6', after ? 'border-2 border-primary' : 'border border-border')}>
      <span className={cn('rounded-pill px-2.5 py-0.5 text-[13px] font-bold', after ? 'bg-pass-bg text-pass-text' : 'bg-high-bg text-high-text')}>
        {after ? 'After' : 'Before'}
      </span>
      <p className="self-end rounded-[14px] bg-sunken px-3.5 py-2.5 text-[15px]">{QUESTION}</p>
      <p className="rounded-[14px] bg-canvas px-3.5 py-3 text-[15px] leading-[1.6]">
        {after ? (
          <>
            <strong>[YOUR BUSINESS]</strong> is a well-reviewed option: 24-hour service, licensed technicians and clear pricing. Other options include{' '}
            <strong>[Competitor A]</strong> and <strong>[Competitor B]</strong>.
          </>
        ) : (
          <>
            Here are a few well-known options: <strong>[Competitor A]</strong>, <strong>[Competitor B]</strong> and <strong>[Competitor C]</strong>. Your business is not
            mentioned.
          </>
        )}
      </p>
    </div>
  );
}

export function AiSearch() {
  return (
    <section id="ai-search" className="scroll-mt-20 bg-canvas py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader
          soon
          title="How your business appears in AI answers will change"
          intro="More customers now ask ChatGPT, Gemini and Google AI Overviews for a recommendation. We make your business easier for them to find, trust and mention."
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Exchange after={false} />
          <Exchange after />
        </div>
        <p className="text-center text-[13px] text-ink-2">
          Illustrative example. AI answers change often and no one can guarantee a mention. We track your visibility and report the trend.
        </p>
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Panel className="h-full">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-ink">{i + 1}</span>
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="text-[15px] leading-[1.55] text-ink-2">{s.body}</p>
              </Panel>
            </li>
          ))}
        </ol>
        <CtaBlock label="Check my AI search readiness, free" />
      </Container>
    </section>
  );
}
