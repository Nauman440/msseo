import type { Metadata } from 'next';
import { AuditNowCard, ConnectGoogleCard, LockedPlanCard, LockedTiles } from '@/components/customer/ConnectGoogle';
import { AlertsCard, ConnectedTiles, ConnectionsCard, PlanCard } from '@/components/customer/Connected';
import { JourneyCard } from '@/components/customer/JourneyCard';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { journeyFor } from '@/lib/journey';
import { siteGoogleData } from '@/lib/customer-google';
import { loadCustomerSite } from '@/lib/customer-site';
import { PLANS } from '@/lib/accounts';

export const metadata: Metadata = { title: 'Your dashboard' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ welcome?: string; site?: string }> };

/** Customer overview (design: Dashboard redesign, before and after Google is connected). */
export default async function CustomerDashboard({ searchParams }: Props) {
  const { welcome, site } = await searchParams;
  const s = await loadCustomerSite(site);
  const data = s.connected && s.google.site ? await siteGoogleData(s.user.id, s.domain, s.google.site, s.latest) : null;

  return (
    <>
      {welcome && (
        <section role="status" className="rounded-[18px] bg-night p-6 text-mist sm:p-8">
          <h2 className="font-display text-[24px] font-bold">You are all set, {s.user.name.split(' ')[0]}</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-mist-2">
            Your {PLANS[s.account.plan].name} trial is running. In a few minutes autopilot finds your competitors, researches your keywords and builds your page plan and 6-month action plan, then keeps them up to date every month. Follow the steps below one at a time.
          </p>
        </section>
      )}
      <SiteFrame s={s} tab="overview">
        <JourneyCard journey={await journeyFor(s)} domain={s.domain} />
        {data ? (
          <>
            <ConnectedTiles report={s.latest} data={data} google={s.google} domain={s.domain} />
            {data.errors.length > 0 && (
              <p role="alert" className="rounded-[14px] border border-border bg-surface p-4 text-sm text-ink-2">
                Some Google data could not be read just now ({data.errors[0]}). It is tried again on your next visit.
              </p>
            )}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
              <PlanCard rows={data.plan} />
              <div className="flex flex-col gap-5">
                <AlertsCard report={s.latest} latestId={s.latestId} />
                <ConnectionsCard google={s.google} domain={s.domain} />
              </div>
            </div>
          </>
        ) : (
          <>
            <ConnectGoogleCard domain={s.domain} google={s.google} />
            <LockedTiles />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <AuditNowCard report={s.latest} latestId={s.latestId} running={s.running} />
              <LockedPlanCard />
            </div>
          </>
        )}
      </SiteFrame>
    </>
  );
}
