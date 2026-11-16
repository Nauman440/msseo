import type { Metadata } from 'next';
import { AiSearch } from '@/components/landing/AiSearch';
import { Automation } from '@/components/landing/Automation';
import { Faq, FinalCta, SiteFooter, StickyBar } from '@/components/landing/Closing';
import { Hero, TopBar } from '@/components/landing/Hero';
import { Approvals, HowItWorks } from '@/components/landing/HowItWorks';
import { Issues } from '@/components/landing/Issues';
import { Outcomes } from '@/components/landing/Outcomes';
import { Pricing } from '@/components/landing/Plans';
import { Problem } from '@/components/landing/Problem';
import { Reports } from '@/components/landing/Reports';
import { StructuredData } from '@/components/landing/StructuredData';
import { Team } from '@/components/landing/Team';
import { SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

/** Public landing page (design: Homepage-html/Main.dc.html). The only indexable page. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Free SEO Audit Tool: Check Your Site in a Minute | MSScore' },
  description:
    'Free SEO audit by Morosoft: check technical SEO, on-page SEO, speed, mobile and AI search readiness. Get a health score and a clear list of what to fix first.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'MSScore by Morosoft',
    title: 'Free SEO Audit Tool | MSScore by Morosoft',
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: 'Free SEO Audit Tool | MSScore by Morosoft', description: SITE_DESCRIPTION },
};

export default function LandingPage() {
  return (
    <div className="bg-canvas text-ink">
      <StructuredData />
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
        <Automation />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <StickyBar />
    </div>
  );
}
