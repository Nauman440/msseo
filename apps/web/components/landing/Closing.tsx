import { Wordmark } from '@/components/ui/Wordmark';
import { CONTACT_HREF } from '@/lib/site';
import { AuditForm } from './AuditForm';
import { ComingSoon, Container, CtaLink } from './primitives';

// `soon` marks answers that describe features not built yet.
const FAQ: { q: string; a: string; soon?: boolean }[] = [
  { q: 'What does the free SEO audit include?', a: 'A scan of your website that checks technical SEO, on-page SEO, speed, mobile, robots.txt, sitemap, structured data and AI search readiness. You get a health score and your top issues ranked by priority.' },
  { q: 'Do I need to know SEO to use it?', a: 'No. Every issue is explained in plain language, and the tool prepares the fix for you. You only decide whether to approve it.', soon: true },
  { q: 'Will anything change on my website without my permission?', a: 'No. You see the old and new version of every change before it goes live, and you can undo any change with one click. Risky changes such as robots.txt, redirects and new pages always wait for your approval.', soon: true },
  { q: 'Which websites does it work with?', a: 'The free audit works on any public website. Direct WordPress and Shopify connections, and a code snippet for other website builders, are coming soon.' },
  { q: 'How is this different from an SEO agency or an SEO tool?', a: 'An SEO tool gives you a list of problems and leaves the work to you. An agency does the work, usually for a high monthly retainer. We prepare and apply the fixes like an agency, at a software price, and you keep control of every change.' },
  { q: 'What reports will I get?', a: 'Daily alerts only when something needs your attention, a weekly progress summary, and a monthly report showing what was fixed and the clicks, calls and leads you gained.', soon: true },
  { q: 'Can you help my business appear in ChatGPT and AI search?', a: 'Yes. We track how AI assistants answer the questions your customers ask, then improve the content, schema and trust signals they rely on. Nobody can guarantee a mention, so we report the trend honestly.', soon: true },
  { q: 'How long until I see results?', a: 'Technical fixes are often picked up within days or weeks. Growth in rankings and leads usually takes a few months, and you see the progress in every report.' },
  { q: 'What does it cost, and do you guarantee rankings?', a: 'Autopilot will be $79 a month for one website and Growth $229 a month for up to 3 websites. No honest provider can guarantee rankings. We guarantee the work, the approvals and clear reporting.', soon: true },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-canvas py-16 sm:py-20">
      <Container className="flex flex-wrap items-start gap-14">
        <div className="flex min-w-0 flex-[0.8_1_280px] flex-col gap-4 lg:sticky lg:top-6">
          <span className="self-start rounded-full bg-primary-chip px-3.5 py-1.5 text-[13px] font-bold text-primary-heading">FAQ</span>
          <h2 className="font-display text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[40px]">Questions business owners ask before they start</h2>
          <p className="text-base leading-[1.6] text-ink-2">Straight answers about the audit, the fixes, the reports and the price.</p>
          <div className="mt-2 flex flex-col gap-3 rounded-card border border-border bg-surface p-[22px]">
            <p className="text-[17px] font-bold">Still have a question?</p>
            <p className="text-sm leading-[1.55] text-ink-2">Talk to a person on our team. No pressure, no sales script.</p>
            <CtaLink href={CONTACT_HREF} size="md" className="self-start">
              Book a free call
            </CtaLink>
          </div>
        </div>
        <ol className="flex min-w-0 flex-[1.4_1_300px] flex-col border-b border-border">
          {FAQ.map((f, i) => (
            <li key={f.q} className="flex gap-4 border-t border-border py-[22px]">
              <span className="font-display text-sm font-bold text-primary-text tabular">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex flex-col gap-2">
                <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
                  {f.q}
                  {f.soon && <ComingSoon />}
                </h3>
                <p className="text-[15px] leading-[1.6] text-ink-2">{f.a}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="bg-night py-16 text-mist sm:py-[72px]">
      <Container className="flex flex-col items-center gap-5 text-center">
        <h2 className="max-w-[720px] font-display text-[28px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[38px]">
          Your competitors are getting your calls. Find out why in a few minutes.
        </h2>
        <p className="max-w-[600px] text-[17px] text-mist-3">Run your free SEO audit now and get a clear list of what to fix first.</p>
        <AuditForm id="final-url" label="Your website" button="Get my free SEO audit" hideLabel className="w-full max-w-[620px]" />
      </Container>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-night-deep py-9 text-sm text-mist-3">
      <Container className="flex flex-wrap justify-between gap-5">
        <div>
          <Wordmark tone="light" />
          <p className="mt-1.5">SEO audits and automatic fixes for local businesses.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <a href={CONTACT_HREF} className="hover:text-mist">
            Contact
          </a>
          <span>© {new Date().getFullYear()} Morosoft Technologies</span>
        </nav>
      </Container>
    </footer>
  );
}

export function StickyBar() {
  return (
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-night-line bg-night px-4 py-3 text-mist sm:px-6">
      <p className="hidden text-[15px] font-semibold sm:block">See what is costing you customers. Free audit in a few minutes.</p>
      <CtaLink size="md">
        Get my free audit
      </CtaLink>
    </div>
  );
}
