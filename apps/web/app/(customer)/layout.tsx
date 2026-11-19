import type { Metadata } from 'next';
import Link from 'next/link';
import { SidebarBody } from '@/components/customer/Sidebar';
import { Logo } from '@/components/ui/Logo';
import { accountSites, getAccountByUserId, PLANS } from '@/lib/accounts';
import { requireCustomer } from '@/lib/session';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Customer area (design: Dashboard redesign, 2026-11-17): navy sidebar, trial banner, page. */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  const plan = account ? PLANS[account.plan] : null;
  const trialLeft = account ? Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000) : 0;
  const status = account ? (account.status === 'trial' ? 'Free trial' : account.status === 'active' ? `${plan!.name} plan` : 'Cancelled') : '';
  const canAddSite = Boolean(account && plan && accountSites(account).length < plan.websites);
  const sidebar = <SidebarBody name={user.name} plan={status} canAddSite={canAddSite} />;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* Wide screens: fixed sidebar. */}
      {/* The navy column runs the full page height; the menu inside it stays in view while scrolling. */}
      <div className="hidden w-[248px] shrink-0 bg-night lg:block print:hidden">
      <aside className="sticky top-0 flex h-dvh flex-col gap-3.5 overflow-y-auto px-3.5 py-[22px]">
        <Link href="/my" aria-label="Your dashboard" className="px-2.5">
          <Logo tone="light" height={30} />
        </Link>
        {sidebar}
      </aside>
      </div>
      {/* Phones and tablets: top bar with the same menu behind a button. */}
      <header className="sticky top-0 z-30 bg-night lg:hidden print:hidden">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
            <Logo tone="light" height={26} />
            <span className="inline-flex min-h-10 items-center rounded-control border border-night-line px-3 text-sm font-semibold text-mist group-open:bg-night-3">Menu</span>
          </summary>
          <div className="max-h-[80dvh] overflow-y-auto border-t border-night-line px-3.5 py-4">{sidebar}</div>
        </details>
      </header>
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px] px-4 py-7 sm:px-9">
          {account?.status === 'trial' && (
            <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-[14px] border border-primary-tint bg-primary-chip px-[18px] py-3.5 print:hidden">
              <p className="text-sm leading-normal text-[#7C2D12]">
                <strong>{trialLeft > 0 ? `Free trial: ${trialLeft} ${trialLeft === 1 ? 'day' : 'days'} left.` : 'Your free trial has ended.'}</strong>{' '}
                {trialLeft > 0 ? `Your plan starts on ${day(account.trialEndsAt)}. Cancel before then and you are not charged.` : 'We will contact you to confirm your plan.'}
              </p>
              <Link href="/my/account#plan" className="text-sm font-bold text-primary-heading underline">
                Manage trial
              </Link>
            </div>
          )}
          {account?.status === 'cancelled' && (
            <p role="status" className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              Your plan is cancelled: weekly checks and new audits are paused.{' '}
              <Link href="/my/account#plan" className="font-semibold text-primary-heading underline">
                Restart it in your account
              </Link>
              .
            </p>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
