import { cn } from '@/lib/tones';
import { Icon, type IconName } from './icons';
import { Container, CtaBlock, SectionHeader } from './primitives';

/* "What you can automate with MSScore" (homepage design, 2026-11-16 update). */

type Kind = 'auto' | 'approve' | 'draft';

const KIND: Record<Kind, { icon: IconName; tile: string; label: string; stat: string }> = {
  auto: { icon: 'bolt', tile: 'bg-teal-chip text-teal-text', label: 'Runs automatically', stat: 'run automatically, with no work from you' },
  approve: { icon: 'tick', tile: 'bg-primary-chip text-primary-heading', label: 'Applied after your approval', stat: 'applied after you approve with one click' },
  draft: { icon: 'pen', tile: 'bg-sunken text-ink-2', label: 'Drafted for you, finished by a person', stat: 'drafted for you, finished by a person' },
};

// [kind, text]: a = runs automatically, o = one-click approval, d = drafted for a person.
type Item = ['a' | 'o' | 'd', string];
const AREAS: { icon: IconName; title: string; plan: 'All plans' | 'Growth'; items: Item[] }[] = [
  { icon: 'doc', title: 'Audits and monitoring', plan: 'All plans', items: [['a', 'Weekly full-site audit'], ['a', 'Health score and priority ranking'], ['a', 'Uptime and SSL expiry checks'], ['a', 'robots.txt and noindex change alerts'], ['a', 'Sitemap health checks'], ['a', 'Traffic, ranking and indexing drop alerts'], ['a', 'Core Web Vitals tracking']] },
  { icon: 'wrench', title: 'Technical SEO fixes', plan: 'All plans', items: [['o', 'Redirects for broken pages and broken backlinks'], ['o', 'Redirect chain and loop cleanup'], ['o', 'Canonical tag corrections'], ['o', 'robots.txt corrections'], ['o', 'Sitemap creation and updates'], ['o', 'Noindex removal on important pages'], ['o', 'Schema markup for your business, services and FAQs'], ['d', 'Step-by-step guides for speed, mobile and domain issues']] },
  { icon: 'lines', title: 'On-page SEO fixes', plan: 'All plans', items: [['o', 'Title tags: missing, duplicate or wrong length'], ['o', 'Meta descriptions: missing, duplicate or wrong length'], ['o', 'H1 and heading structure'], ['o', 'Image alt text'], ['o', 'Internal links and orphan pages'], ['o', 'Quick wins for pages ranking 4 to 20'], ['a', 'Alerts when two pages compete for one keyword'], ['a', 'Alerts when a page starts losing traffic']] },
  { icon: 'trend', title: 'Keywords and competitors', plan: 'Growth', items: [['a', 'Keyword ideas from your services and locations'], ['a', 'Search volume, difficulty and intent'], ['a', 'Keyword grouping, one topic per page'], ['a', 'Keyword-to-page mapping'], ['a', 'Rank tracking, including map results'], ['a', 'Competitor discovery from real search results'], ['a', 'Keyword, content and link gap lists'], ['a', 'Alerts for new competitor pages and links'], ['d', '6 to 8 month roadmap, reviewed by a specialist']] },
  { icon: 'pen', title: 'Content', plan: 'Growth', items: [['a', 'Content briefs with outline and questions'], ['d', 'Refresh suggestions for outdated pages'], ['o', 'FAQ and direct-answer blocks for service pages'], ['d', 'New service and location page drafts'], ['d', 'Business Profile post drafts']] },
  { icon: 'pin', title: 'Local SEO', plan: 'Growth', items: [['a', 'Business Profile completeness checks'], ['a', 'New review alerts'], ['o', 'Review reply drafts'], ['o', 'Review request messages after a job'], ['a', 'Name, address and phone consistency checks'], ['a', 'Missing directory listing finder']] },
  { icon: 'chat', title: 'AI search', plan: 'Growth', items: [['a', 'Weekly tracking across AI assistants'], ['a', 'AI visibility score against competitors'], ['a', 'Sources AI assistants cite in your niche'], ['a', 'AI crawler access checks'], ['a', 'Alerts for wrong facts about your business'], ['d', 'Answer-ready content suggestions']] },
  { icon: 'link', title: 'Off-page SEO', plan: 'Growth', items: [['a', 'Backlink monitoring: new, lost and broken'], ['a', 'Spam link spike alerts'], ['a', 'Unlinked brand mention finder'], ['a', 'Link opportunities from competitor gaps'], ['d', 'Outreach email drafts, sent by a person']] },
  { icon: 'bars', title: 'Reports', plan: 'All plans', items: [['a', 'Daily alerts, only when needed'], ['a', 'Weekly progress summary'], ['a', 'Monthly report with clicks, calls and leads'], ['a', 'Result checks after 7, 14 and 28 days'], ['o', 'One-click rollback for any change']] },
];

const LETTER: Record<Item[0], Kind> = { a: 'auto', o: 'approve', d: 'draft' };
const all = AREAS.flatMap((a) => a.items.map(([k]) => LETTER[k]));
const COUNTS = (Object.keys(KIND) as Kind[]).map((k) => ({ kind: k, n: all.filter((x) => x === k).length }));

function KindTile({ kind, size }: { kind: Kind; size: 'sm' | 'lg' }) {
  const k = KIND[kind];
  return (
    <span className={cn('flex shrink-0 items-center justify-center', k.tile, size === 'sm' ? 'size-6 rounded-[7px]' : 'size-[46px] rounded-tile')} aria-hidden="true">
      <Icon name={k.icon} className={size === 'sm' ? 'size-3.5' : 'size-[22px]'} />
    </span>
  );
}

export function Automation() {
  return (
    <section id="automation" className="scroll-mt-20 bg-canvas py-16 sm:py-[84px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader
          soon
          eyebrow="Automation"
          title="What you can automate with MSScore"
          intro={`${all.length} SEO jobs across ${AREAS.length} areas, handled for you. You only step in to approve the changes that touch your website.`}
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COUNTS.map((c) => (
            <li key={c.kind} className="flex items-center gap-4 rounded-card border border-border bg-surface p-5">
              <KindTile kind={c.kind} size="lg" />
              <div>
                <span className="font-display text-[32px] font-extrabold leading-none tracking-[-0.02em] tabular">{c.n}</span>
                <p className="mt-1 text-sm text-ink-2">{KIND[c.kind].stat}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => (
            <article key={a.title} className="flex flex-col gap-[18px] rounded-[20px] border border-border bg-surface p-6">
              <header className="flex items-start gap-3.5">
                <span className="flex size-[46px] shrink-0 items-center justify-center rounded-tile bg-night text-primary-tint" aria-hidden="true">
                  <Icon name={a.icon} className="size-[22px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[19px] font-bold leading-tight tracking-[-0.01em]">{a.title}</h3>
                  <p className="mt-0.5 text-[13px] text-ink-2">{a.items.length} automations</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold',
                    a.plan === 'Growth' ? 'bg-primary-chip text-primary-heading' : 'bg-teal-chip text-teal-text',
                  )}
                >
                  {a.plan}
                </span>
              </header>
              <ul className="flex flex-col gap-3">
                {a.items.map(([k, text]) => (
                  <li key={text} className="flex gap-3 text-[15px] leading-[1.45]">
                    <KindTile kind={LETTER[k]} size="sm" />
                    <span>
                      <span className="sr-only">{KIND[LETTER[k]].label}: </span>
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <CtaBlock label="See what MSScore can automate for my website" note="Free audit. No card needed. Takes a few minutes." />
      </Container>
    </section>
  );
}
