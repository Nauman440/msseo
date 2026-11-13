import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';
import { AuditForm } from './AuditForm';
import { Check } from './icons';
import { ComingSoon, Container, CtaLink } from './primitives';
import { SampleScore } from './SampleScore';

const NAV = [
  { href: '#outcomes', label: 'Why it works' },
  { href: '#how', label: 'How it works' },
  { href: '#team', label: 'Your team' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const STATS: { value: string; label: string; soon?: boolean }[] = [
  { value: '~3 min', label: 'to get your free audit' },
  { value: '31', label: 'SEO issue types checked' },
  { value: '1 click', label: 'to approve a fix', soon: true },
  { value: '$79', label: 'a month to get started', soon: true },
];

const TOOLS = ['WordPress', 'Shopify', 'Google Search Console', 'Google Analytics', 'Google Business Profile'];

export function TopBar() {
  return (
    <>
      <p className="bg-primary px-6 py-2.5 text-center text-sm font-bold text-primary-ink">
        Free SEO audit: see what is costing you customers in a few minutes.
      </p>
      <header className="border-b border-border bg-surface">
        <Container className="flex items-center justify-between gap-3 py-3.5">
          <Link href="/" aria-label="MSScore home">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-x-[22px] text-[15px]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hidden font-medium text-ink-2 hover:text-ink md:inline">
                {n.label}
              </a>
            ))}
            <CtaLink size="sm">
              Get my free audit
            </CtaLink>
          </nav>
        </Container>
      </header>
    </>
  );
}

export function Hero() {
  return (
    <>
      <section className="bg-night pb-16 pt-14 sm:pt-[76px]">
        <Container className="flex flex-col gap-12">
          <div className="flex flex-wrap items-center gap-12">
            <div className="flex min-w-0 flex-[1.15_1_300px] flex-col gap-[22px]">
              <span className="self-start rounded-full bg-night-3 px-3.5 py-1.5 text-[13px] font-bold text-primary-tint">
                SEO on autopilot for local businesses
              </span>
              <h1 className="font-display text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-mist sm:text-[50px]">
                Get more customers from Google and AI search, <span className="text-primary-tint">without doing SEO yourself</span>
              </h1>
              <p className="max-w-[580px] text-[17px] leading-[1.6] text-mist-3 sm:text-[19px]">
                Run a free audit to see what is costing you customers. Then approve the fixes with one click and watch your calls and leads grow.
              </p>
              <div className="flex max-w-[640px] flex-col gap-3 rounded-card border border-night-line bg-night-2 p-[18px]">
                <AuditForm id="hero-url" label="Enter your website to start" button="Show me what to fix" />
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-mist-3">
                  {['Free', 'No card needed', 'Results in a few minutes'].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check tone="tick" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="min-w-0 flex-[0.9_1_300px]">
              <SampleScore />
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {STATS.map((s) => (
              <li key={s.label} className="rounded-[14px] border border-night-line px-[18px] py-4">
                <span className="font-display text-[24px] font-extrabold leading-[1.1] text-primary sm:text-[28px]">{s.value}</span>
                <p className="mt-1.5 text-sm text-mist-3">{s.label}</p>
                {s.soon && <ComingSoon dark className="mt-2" />}
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <section className="border-b border-border bg-surface py-[26px]">
        <Container className="flex flex-wrap items-center justify-center gap-3">
          <p className="mr-1.5 text-sm font-bold text-ink-2">Works with the tools you already use</p>
          {TOOLS.map((t) => (
            <span key={t} className="rounded-full border border-border bg-canvas px-4 py-2 text-sm font-semibold">
              {t}
            </span>
          ))}
        </Container>
      </section>
    </>
  );
}
