import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { AuditForm } from './AuditForm';
import { Check } from './icons';
import { ComingSoon, Container, CtaLink } from './primitives';
import { SampleScore } from './SampleScore';

const NAV = [
  { href: '/#outcomes', label: 'Why it works' },
  { href: '/#how', label: 'How it works' },
  { href: '/#automation', label: 'Automation' },
  { href: '/#team', label: 'Your team' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
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
      <div className="bg-primary text-primary-ink">
        <Container className="flex items-center justify-between gap-4 py-1.5">
          {/* Spacer keeps the message centred on wide screens while the account links sit on the right. */}
          <span aria-hidden className="hidden w-[150px] shrink-0 lg:block" />
          <p className="min-w-0 text-sm font-bold sm:text-center">
            <span className="sm:hidden">Free SEO audit in minutes</span>
            <span className="hidden sm:inline">Free SEO audit: see what is costing you customers in a few minutes.</span>
          </p>
          {/* Returning customers and the team sign in here; new customers start the 7-day trial. */}
          <nav aria-label="Account" className="flex w-auto shrink-0 items-center justify-end gap-3 text-sm font-bold lg:w-[150px]">
            <Link href="/login" className="inline-flex min-h-9 items-center whitespace-nowrap hover:underline">
              Log in
            </Link>
            <Link href="/signup" className="inline-flex min-h-9 items-center whitespace-nowrap rounded-control border border-primary-ink/40 px-3 hover:border-primary-ink">
              Sign up
            </Link>
          </nav>
        </Container>
      </div>
      <header className="border-b border-border bg-surface">
        <Container className="flex items-center justify-between gap-3 py-3.5">
          <Link href="/" aria-label="MS SCORE home" className="shrink-0">
            {/* Smaller on phones so the logo and the CTA fit one line at 375 px. */}
            <Logo height={28} priority className="sm:hidden" />
            <Logo height={36} priority className="hidden sm:block" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-x-4 text-[15px] xl:gap-x-[22px]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hidden whitespace-nowrap font-medium text-ink-2 hover:text-ink lg:inline">
                {n.label}
              </a>
            ))}
            <CtaLink size="sm" className="whitespace-nowrap">
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
