import type { Metadata } from 'next';
import { AiSearch } from '@/components/landing/AiSearch';
import { Faq, FinalCta, SiteFooter, StickyBar } from '@/components/landing/Closing';
import { Hero, TopBar } from '@/components/landing/Hero';
import { Approvals, HowItWorks } from '@/components/landing/HowItWorks';
import { Issues } from '@/components/landing/Issues';
import { Outcomes } from '@/components/landing/Outcomes';
import { Included, Pricing } from '@/components/landing/Plans';
import { Problem } from '@/components/landing/Problem';
import { Reports } from '@/components/landing/Reports';
import { Team } from '@/components/landing/Team';

/** Public landing page (design: Homepage-html/Main.dc.html). The only indexable page. */
export const metadata: Metadata = {
  title: { absolute: 'Free SEO Audit and SEO Fixes | MSScore by Morosoft' },
  description:
    'Run a free SEO audit and see what is costing you customers: technical and on-page checks, a health score and a clear list of what to fix first.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Free SEO Audit | MSScore by Morosoft', type: 'website' },
};

export default function LandingPage() {
  return (
    <div className="bg-canvas text-ink">
      <TopBar />
      <main id="main">
        <Hero />
        <Problem />
        <Outcomes />
        <HowItWorks />
        <Approvals />
        <Issues />
        <AiSearch />
        <Reports />
        <Team />
        <Included />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <StickyBar />
    </div>
  );
}
