import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/landing/Closing';
import { TopBar } from '@/components/landing/Hero';
import { Container } from '@/components/landing/primitives';
import { LEGAL_UPDATED } from '@/lib/site';

/** Public legal page layout (privacy policy, terms): landing header and footer, readable text column. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <TopBar />
      <main id="main" className="bg-canvas">
        <Container className="max-w-3xl py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary-text">Legal</p>
          <h1 className="mt-2 font-display text-[34px] font-bold leading-tight tracking-display sm:text-[42px]">{title}</h1>
          <p className="mt-3 text-[15px] text-ink-3">Last updated: {LEGAL_UPDATED}</p>
          <p className="mt-6 text-[17px] leading-8 text-ink-2">{intro}</p>
          <div className="legal mt-10 space-y-10">{children}</div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="font-display text-[22px] font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-ink-2 [&_a]:font-semibold [&_a]:text-primary-text [&_a]:underline [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
