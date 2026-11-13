import { AuditForm } from './AuditForm';
import { Check, IconTile, type IconName } from './icons';
import { Chip, Container, Panel, Section, SectionHeader } from './primitives';

const PROBLEMS: { icon: IconName; title: string; body: string; cost: string }[] = [
  { icon: 'search', title: 'Google cannot find your key pages', body: 'Broken pages, blocked files and missing sitemaps hide your services from search.', cost: 'People searching for you never see you.' },
  { icon: 'lines', title: 'Your listing does not earn the click', body: 'Missing or weak titles and descriptions make your result easy to skip.', cost: 'You show up, but they click someone else.' },
  { icon: 'bolt', title: 'Your site is slow on phones', body: 'Heavy images and scripts make mobile visitors wait.', cost: 'Visitors leave before they call.' },
  { icon: 'chat', title: 'AI assistants do not mention you', body: 'ChatGPT and Google AI answers pick businesses with clear, trusted information.', cost: 'AI recommends your competitor.' },
];

const INCLUDED = [
  'Your SEO health score',
  'Top issues ranked by priority',
  'Technical and on-page checks',
  'robots.txt and sitemap check',
  'AI search readiness check',
  'A clear list of what to fix first',
];

export function Problem() {
  return (
    <>
      <Section>
        <Container className="flex flex-col gap-9">
          <SectionHeader
            eyebrow="The problem"
            title="Your website may be sending customers to your competitors"
            intro="Most business owners never find out, because nobody checks. These four problems are the most common."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p) => (
              <Panel key={p.title}>
                <IconTile name={p.icon} />
                <h3 className="font-display text-[19px] font-bold leading-[1.3]">{p.title}</h3>
                <p className="text-[15px] leading-[1.55] text-ink-2">{p.body}</p>
                <p className="mt-auto rounded-control bg-warn-bg px-3 py-2.5 text-sm font-bold text-fail-text">{p.cost}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      <section className="bg-canvas pb-16 sm:pb-[84px]">
        <Container>
          <div className="flex flex-wrap items-center gap-9 rounded-[24px] bg-night p-6 sm:p-9">
            <div className="flex min-w-0 flex-[1.3_1_280px] flex-col gap-[18px]">
              <Chip tone="solid" className="self-start">
                100% free
              </Chip>
              <h3 className="font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-mist sm:text-[30px]">
                Your free audit shows you exactly what to fix
              </h3>
              <ul className="grid grid-cols-1 gap-x-[22px] gap-y-3 sm:grid-cols-2">
                {INCLUDED.map((t) => (
                  <li key={t} className="flex gap-2.5 text-[15px] leading-[1.45] text-mist-2">
                    <Check tone="tick" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-[0.8_1_260px] flex-col gap-2.5 rounded-card border border-night-line bg-night-2 p-5">
              <AuditForm id="free-url" label="Your website" button="Run my free audit" layout="stack" />
              <p className="text-center text-[13px] text-mist-3">No card needed. Results in a few minutes.</p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
