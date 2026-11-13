import { CONTACT_HREF } from '@/lib/site';
import { cn } from '@/lib/tones';
import { Check } from './icons';
import { ComingSoon, Container, CtaBlock, CtaLink, SectionHeader } from './primitives';

const INCLUDED: { title: string; plan: string; items: string[]; soon?: boolean }[] = [
  { title: 'Audit and monitoring', plan: 'All plans', items: ['Weekly automatic site audit', 'Technical and on-page checks', 'robots.txt and sitemap.xml checks', 'Uptime, SSL and indexing alerts'] },
  { title: 'Fixes with approval', plan: 'All plans', soon: true, items: ['Titles, meta descriptions and alt text', 'Internal links and structured data', 'WordPress and Shopify connection', 'Before and after view and one-click rollback'] },
  { title: 'Reports', plan: 'All plans', soon: true, items: ['Daily alerts when something needs attention', 'Weekly progress summary', 'Monthly results report', 'Plain language, no jargon'] },
  { title: 'Competitors and keywords', plan: 'Growth', soon: true, items: ['Competitor shortlist and tracking', 'Keyword research and clusters', 'Keyword-to-page mapping', '6 to 8 month roadmap'] },
  { title: 'Local SEO', plan: 'Growth', soon: true, items: ['Business profile checks', 'Review monitoring and reply drafts', 'Listing and citation consistency', 'Map ranking tracking'] },
  { title: 'AI search', plan: 'Growth', soon: true, items: ['AI visibility tracking across assistants', 'Answer-ready content suggestions', 'Schema and crawler access checks', 'AI share of voice score'] },
];

const PLANS = [
  { name: 'Free audit', price: '$0', unit: 'no card needed', body: 'See what is holding your website back before you pay anything.', items: ['SEO health score', 'Top issues ranked by priority', 'Technical and on-page checks', 'Full report sent to your email'], cta: 'Run my free audit', free: true },
  { name: 'Autopilot', price: '$79', unit: '/month', body: 'Automatic audits and safe fixes for one website.', items: ['Weekly automatic site audit', 'Titles, meta descriptions, alt text and internal links fixed after your approval', 'WordPress and Shopify connection', 'Monthly progress report'], cta: 'Start Autopilot' },
  { name: 'Growth', price: '$229', unit: '/month', body: 'Everything in Autopilot plus rankings and local growth, for up to 3 websites.', items: ['Up to 3 websites', 'Keyword and competitor tracking', 'Local SEO and review monitoring', 'AI search visibility tracking', 'Content briefs with human review', 'Monthly strategy call'], cta: 'Choose Growth', popular: true },
  { name: 'Full SEO package', price: 'Custom', unit: 'quote', body: 'A dedicated team that handles SEO for you.', items: ['Content and link building', 'Local SEO and citations', 'Conversion optimisation', 'Reporting on leads and revenue'], cta: 'Book a strategy call' },
];

export function Included() {
  return (
    <section id="included" className="scroll-mt-20 bg-surface py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader title="What is included in the tool" intro="Everything you need to find, fix and track your SEO in one place." />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((g) => (
            <div key={g.title} className="flex flex-col gap-3 rounded-card border border-border p-6">
              <div className="flex items-center justify-between gap-2.5">
                <h3 className="text-lg font-extrabold">{g.title}</h3>
                <span className="flex shrink-0 gap-1.5">
                  {g.soon && <ComingSoon />}
                  <span className="rounded-pill bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-heading">{g.plan}</span>
                </span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {g.items.map((i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-[1.5]">
                    <Check />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <CtaBlock label="Get my free SEO audit" note={null} />
      </Container>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-canvas py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader soon title="Simple plans to fix your SEO" intro="Start with automatic audits and safe fixes. Add growth tools or a dedicated team when you are ready." />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.name} className={cn('flex flex-col gap-4 rounded-card bg-surface p-6', p.popular ? 'border-2 border-primary' : 'border border-border')}>
              {p.popular && <span className="self-start rounded-pill bg-primary px-2.5 py-0.5 text-xs font-extrabold text-primary-ink">Most popular</span>}
              <h3 className="text-xl font-extrabold">{p.name}</h3>
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-[36px] font-extrabold tracking-[-0.02em]">{p.price}</span>
                <span className="text-sm text-ink-2">{p.unit}</span>
              </p>
              <p className="text-sm text-ink-2">{p.body}</p>
              <ul className="flex flex-col gap-2.5">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <Check />
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {p.free ? (
                  <CtaLink size="md" className="w-full">
                    {p.cta}
                  </CtaLink>
                ) : (
                  <a href={CONTACT_HREF} className="flex min-h-[46px] w-full items-center justify-center rounded-button border border-border-strong text-sm font-bold hover:border-ink-3">
                    {p.cta === 'Book a strategy call' ? p.cta : 'Join the waitlist'}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[15px] text-ink-2">Not sure which plan fits? Start with the free audit and decide after you see your report.</p>
      </Container>
    </section>
  );
}
