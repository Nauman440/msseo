import { CONTACT_HREF } from '@/lib/site';
import { cn } from '@/lib/tones';
import { Check } from './icons';
import { Container, CtaLink, SectionHeader } from './primitives';

const PLANS = [
  { name: 'Free audit', price: '$0', unit: 'no card needed', body: 'See what is holding your website back before you pay anything.', items: ['SEO health score', 'Top issues ranked by priority', 'Technical and on-page checks', 'Full report sent to your email'], cta: 'Run my free audit', free: true },
  { name: 'Autopilot', price: '$79', unit: '/month', body: 'Automatic audits and safe fixes for one website.', items: ['Weekly automatic site audit', 'Titles, meta descriptions, alt text and internal links fixed after your approval', 'WordPress and Shopify connection', 'Monthly progress report'], cta: 'Start Autopilot', plan: 'autopilot' },
  { name: 'Growth', price: '$229', unit: '/month', body: 'Everything in Autopilot plus rankings and local growth, for up to 3 websites.', items: ['Up to 3 websites', 'Keyword and competitor tracking', 'Local SEO and review monitoring', 'AI search visibility tracking', 'Content briefs with human review', 'Monthly strategy call'], cta: 'Choose Growth', plan: 'growth', popular: true },
  { name: 'Full SEO package', price: 'Custom', unit: 'quote', body: 'A dedicated team that handles SEO for you.', items: ['Content and link building', 'Local SEO and citations', 'Conversion optimisation', 'Reporting on leads and revenue'], cta: 'Book a strategy call' },
];

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-canvas py-16 sm:py-[72px]">
      <Container className="flex flex-col gap-8">
        <SectionHeader title="Simple plans to fix your SEO" intro="Start with automatic audits and safe fixes. Add growth tools or a dedicated team when you are ready." />
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
                ) : 'plan' in p && p.plan ? (
                  <CtaLink href={`/signup?plan=${p.plan}`} size="md" className="w-full">
                    {p.cta}
                  </CtaLink>
                ) : (
                  <a href={CONTACT_HREF} className="flex min-h-[46px] w-full items-center justify-center rounded-button border border-border-strong text-sm font-bold hover:border-ink-3">
                    {p.cta}
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
