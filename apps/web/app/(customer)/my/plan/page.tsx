import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlanTable } from '@/components/customer/Connected';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { siteGoogleData } from '@/lib/customer-google';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Weekly plan' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Weekly plan tab: the searches closest to page 1 and what to do for each (needs Search Console). */
export default async function PlanPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  if (!s.connected || !s.google.site) redirect(`/my/connections?site=${encodeURIComponent(s.domain)}`);
  const data = await siteGoogleData(s.user.id, s.domain, s.google.site, s.latest);
  return (
    <>
      <SiteHeader domain={s.domain} tab="plan" connected latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} />
      <section aria-labelledby="plan" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
        <div>
          <h2 id="plan" className="font-display text-xl font-bold">This week&apos;s plan</h2>
          <p className="mt-1 text-sm text-ink-2">
            Searches where you are on Google page 1–2 (positions 4–20) and seen often enough to matter, nearest the top first. The actions come from your latest audit of each page. New every Monday from the last 28 days of Search Console.
          </p>
        </div>
        {data.errors.length > 0 && <p role="alert" className="text-sm text-fail-text">Search Console could not be read just now ({data.errors[0]}).</p>}
        <PlanTable rows={data.plan} />
      </section>
    </>
  );
}
