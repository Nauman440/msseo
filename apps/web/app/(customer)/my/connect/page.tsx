import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChooseProperties } from '@/components/customer/ChooseProperties';
import { googleChoices } from '@/lib/customer-google';
import { loadCustomerSite } from '@/lib/customer-site';
import { siteLabel } from '@seo/core';

export const metadata: Metadata = { title: 'Connect Google' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Step after Google sign-in: choose the Search Console and Analytics 4 properties (design: setup choose properties). */
export default async function ConnectPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  if (!s.google.ready) redirect(`/my/connections?site=${encodeURIComponent(s.domain)}`);
  if (!s.google.email) redirect(`/api/google/connect?site=${encodeURIComponent(s.domain)}`);

  let choices: Awaited<ReturnType<typeof googleChoices>> | null = null;
  let error: string | null = null;
  try {
    choices = await googleChoices(s.user.id, s.domain);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not read your Google account.';
  }

  return (
    <div className="mx-auto w-full max-w-[680px] overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,27,45,0.18)]">
      <div className="flex flex-col gap-1.5 border-b border-border px-6 pb-5 pt-6 sm:px-7">
        <p className="text-sm font-semibold text-primary-heading">Connect Google · {siteLabel(s.domain)}</p>
        <h1 className="font-display text-[24px] font-bold">Choose what to connect</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Signed in as {choices?.email ?? s.google.email}
          <a href={`/api/google/connect?site=${encodeURIComponent(s.domain)}`} className="font-semibold text-primary-heading underline">
            Switch account
          </a>
        </p>
      </div>
      {choices && !choices.error && choices.gsc.length > 0 ? (
        <ChooseProperties domain={s.domain} gsc={choices.gsc} ga4={choices.ga4} current={{ gscProperty: s.google.site?.gscProperty ?? null, ga4Property: s.google.site?.ga4Property ?? null }} />
      ) : (
        <div className="flex flex-col gap-4 px-6 py-6 sm:px-7">
          <p role="alert" className="text-[15px] text-ink-2">
            {error ?? choices?.error ?? `This Google account has no Search Console property yet. Add ${siteLabel(s.domain)} to Search Console, or sign in with the account that manages it.`}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="https://support.google.com/webmasters/answer/34592" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-control border border-border-strong px-5 text-[15px] font-semibold hover:border-ink-3">
              How to add a website to Search Console
            </a>
            <a href={`/api/google/connect?site=${encodeURIComponent(s.domain)}`} className="inline-flex min-h-12 items-center rounded-control bg-primary px-5 text-[15px] font-bold text-primary-ink hover:bg-primary-hover">
              Sign in with another account
            </a>
            <Link href={`/my?site=${encodeURIComponent(s.domain)}`} className="inline-flex min-h-12 items-center px-2 text-[15px] font-semibold text-ink-2 underline">
              Back
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
