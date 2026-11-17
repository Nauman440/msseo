import type { Metadata } from 'next';
import { CompetitorWorkspaceView } from '@/components/competitors/CompetitorWorkspaceView';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { getWorkspace } from '@/lib/competitors';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Your competitors' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 3 for customers: their own websites only (Competitors tab). */
export default async function CustomerCompetitorsPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getWorkspace(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="competitors" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} />
      <div>
        <h2 className="font-display text-[24px] font-bold">Your competitors</h2>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-2">Who shows up in Google when your customers search, how strong they are, and which directories you should be listed on.</p>
      </div>
      <CompetitorWorkspaceView ws={ws} audience="customer" />
    </>
  );
}
