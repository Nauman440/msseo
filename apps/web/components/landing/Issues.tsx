import { Check, IconTile, type IconName } from './icons';
import { Container, CtaBlock, Section, SectionHeader } from './primitives';

type Group = { fixed?: string[]; drafted?: string[]; guided?: string[]; monitored?: string[] };

const AREAS: { icon: IconName; title: string; counts: string; intro: string; groups: Group }[] = [
  {
    icon: 'doc',
    title: 'Technical SEO',
    counts: '11 issue types, 7 fixed for you',
    intro: 'Problems that stop Google and AI assistants from reaching and trusting your site.',
    groups: {
      fixed: ['Broken pages (404) and server errors (5xx)', 'Redirect chains and loops', 'Canonical tag errors and duplicate pages', 'robots.txt blocking important pages', 'Sitemap errors and missing pages', 'Noindex tags on important pages', 'Missing structured data (schema)'],
      guided: ['http, https and www duplicates', 'Slow loading and Core Web Vitals', 'Mobile usability'],
      monitored: ['Site down, SSL expiry, indexing drops'],
    },
  },
  {
    icon: 'lines',
    title: 'On-page SEO',
    counts: '11 issue types, 6 fixed for you',
    intro: 'Problems on each page that cost you rankings and clicks.',
    groups: {
      fixed: ['Missing or duplicate title tags', 'Titles that are too short or too long', 'Missing and duplicate meta descriptions', 'Missing or multiple H1 and heading order', 'Missing and duplicate image alt text', 'Weak internal links and orphan pages'],
      drafted: ['Thin or outdated pages', 'FAQs and direct answers for AI search'],
      guided: ['Two pages competing for one keyword', 'Missing reviews, testimonials and licences'],
      monitored: ['Pages losing traffic'],
    },
  },
  {
    icon: 'link',
    title: 'Off-page SEO',
    counts: '9 issue types, 1 fixed for you',
    intro: 'Problems with your links and reputation on other websites.',
    groups: {
      fixed: ['Broken backlinks pointing to deleted pages'],
      drafted: ['Lost backlinks to win back', 'Brand mentions without a link', 'Review requests and reply drafts'],
      guided: ['Competitor links you do not have', 'Inconsistent name, address and phone', 'Missing local directory listings'],
      monitored: ['Spammy link spikes', 'New reviews and mentions'],
    },
  },
];

const STATS = [
  { value: '31', label: 'issue types checked on every audit' },
  { value: '14', label: 'fixed for you after your approval' },
  { value: '17', label: 'drafted, guided or monitored' },
];

const TAGS = {
  drafted: { heading: 'Drafted for you', headingClass: 'text-primary-heading', chip: 'bg-primary-chip text-primary-heading' },
  guided: { heading: 'Guided step by step', headingClass: 'text-ink-2', chip: 'bg-sunken text-ink' },
  monitored: { heading: 'Monitored with alerts', headingClass: 'text-ink', chip: 'bg-night text-mist' },
} as const;

function TagGroup({ kind, items }: { kind: keyof typeof TAGS; items?: string[] }) {
  if (!items?.length) return null;
  const t = TAGS[kind];
  return (
    <div className="flex flex-col gap-2">
      <p className={`text-xs font-bold uppercase tracking-[0.08em] ${t.headingClass}`}>{t.heading}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${t.chip}`}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Issues() {
  return (
    <Section id="issues" tone="navy">
      <Container className="flex flex-col gap-8">
        <SectionHeader
          dark
          align="left"
          soon
          eyebrow="What the tool solves"
          title="The SEO issues we find and solve for you"
          intro="Every issue is explained in plain language, ranked by priority, and handled in the way that is safe for your website. Finding them works today; fixes after your approval are coming soon."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map((s) => (
            <li key={s.label} className="rounded-card border border-night-line px-5 py-[18px]">
              <span className="font-display text-[40px] font-extrabold leading-none text-primary">{s.value}</span>
              <p className="mt-2 text-[15px] text-mist-2">{s.label}</p>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => (
            <article key={a.title} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6 text-ink">
              <header className="flex items-center gap-3.5">
                <IconTile name={a.icon} />
                <div>
                  <h3 className="font-display text-[22px] font-bold leading-tight">{a.title}</h3>
                  <p className="text-[13px] text-ink-2">{a.counts}</p>
                </div>
              </header>
              <p className="text-[15px] leading-[1.55] text-ink-2">{a.intro}</p>
              {a.groups.fixed && (
                <div className="flex flex-col gap-2 rounded-[14px] bg-teal-bg p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-text">Fixed after your approval</p>
                  <ul className="flex flex-col gap-2">
                    {a.groups.fixed.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[15px] leading-[1.4]">
                        <Check tone="teal" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <TagGroup kind="drafted" items={a.groups.drafted} />
              <TagGroup kind="guided" items={a.groups.guided} />
              <TagGroup kind="monitored" items={a.groups.monitored} />
            </article>
          ))}
        </div>
        <p className="text-[15px] text-mist-3">
          We never buy links, post spam links or write fake reviews. Anything that leaves your website is sent or approved by a person.
        </p>
        <CtaBlock dark label="Check my website for these issues, free" />
      </Container>
    </Section>
  );
}
