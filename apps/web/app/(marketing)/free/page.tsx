import type { Metadata } from 'next';
import { SiteFooter } from '@/components/landing/Closing';
import { TopBar } from '@/components/landing/Hero';
import { Container } from '@/components/landing/primitives';
import { FreeAuditForm } from '@/components/free/FreeAuditForm';
import { SITE_URL } from '@/lib/site';
import { turnstileSiteKey } from '@/lib/turnstile';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Free SEO Audit | MSScore by Morosoft' },
  description: 'Run a free SEO audit of your website: health score, top issues and a clear list of what to fix first.',
  alternates: { canonical: '/free' },
};
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ url?: string }> };

/** Public free-audit page (step 8); the landing page's website boxes lead here. */
export default async function FreeAuditPage({ searchParams }: Props) {
  const { url } = await searchParams;
  return (
    <>
      <TopBar />
      <main id="main" className="bg-canvas">
        <Container className="max-w-2xl py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary-text">Free SEO audit</p>
          <h1 className="mt-2 font-display text-[34px] font-bold leading-tight tracking-display sm:text-[42px]">See what is holding your website back</h1>
          <p className="mt-3 text-[17px] leading-8 text-ink-2">We check your site the way Google does: technical setup, page content, speed and mobile. You get a health score and the issues to fix first.</p>
          <div className="mt-8 rounded-panel border border-border bg-surface p-6 shadow-card sm:p-8">
            <FreeAuditForm defaultUrl={typeof url === 'string' ? url : ''} siteKey={turnstileSiteKey()} />
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
