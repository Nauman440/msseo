import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/forms/ActionForm';
import { PlanSettings } from '@/components/customer/PlanSettings';
import { accountSites, domainOf, getAccountByUserId } from '@/lib/accounts';
import { stripeEnabled, stripeTestMode } from '@/lib/billing';
import { requireCustomer } from '@/lib/session';
import { SUPPORT_EMAIL } from '@/lib/site';
import { changeCustomerPasswordAction, saveDetailsAction } from './actions';
import { siteLabel } from '@seo/core';

export const metadata: Metadata = { title: 'Account settings' };
export const dynamic = 'force-dynamic';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const LABEL = 'flex flex-col gap-1.5 text-sm font-semibold';
const PANEL = 'rounded-panel border border-border bg-surface p-6';

/** Customer account settings: plan (switch, cancel, restart), details, business answers, password. */
type Props = { searchParams: Promise<{ billing?: string }> };

export default async function CustomerAccountPage({ searchParams }: Props) {
  const { billing } = await searchParams;
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  const sites = accountSites(account);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[13px] font-medium text-ink-3">
          <Link href="/my" className="hover:text-ink">Your dashboard</Link>
        </p>
        <h1 className="mt-2 font-display text-[30px] font-bold tracking-display sm:text-[36px]">Account settings</h1>
        <p className="mt-2 text-[15px] text-ink-2">Signed in as {user.email}</p>
      </div>

      <PlanSettings account={account} sites={sites} billing={{ enabled: stripeEnabled(), test: stripeTestMode(), notice: billing ?? null }} />

      <section className={PANEL} aria-labelledby="details">
        <h2 id="details" className="mb-4 font-display text-lg font-bold">Your details</h2>
        <ActionForm action={saveDetailsAction} submit="Save details">
          <label className={LABEL}>
            Your name
            <input name="name" required maxLength={100} autoComplete="name" defaultValue={user.name ?? ''} className={INPUT} />
          </label>
          <label className={LABEL}>
            Business name
            <input name="businessName" required maxLength={120} autoComplete="organization" defaultValue={account.businessName} className={INPUT} />
          </label>
          <label className={LABEL}>
            Phone
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={account.phone ?? ''} className={INPUT} />
          </label>
          <p className="text-[13px] text-ink-3">To change your login email ({user.email}), email {SUPPORT_EMAIL} from that address.</p>
        </ActionForm>
      </section>

      <section className={PANEL} aria-labelledby="business">
        <h2 id="business" className="mb-2 font-display text-lg font-bold">Your business</h2>
        <p className="mb-4 text-sm text-ink-2">
          Each website has its own services, places, country and language, under Keywords → Research inputs. That is what we research and plan from.
        </p>
        <ul className="flex flex-col gap-2">
          {accountSites(account).map(domainOf).map((d) => (
            <li key={d} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border px-4 py-3">
              <span className="font-semibold">{siteLabel(d)}</span>
              <Link href={`/my/keywords?site=${encodeURIComponent(d)}&open=inputs#research-inputs`} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary-heading underline">
                Research inputs
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={PANEL} aria-labelledby="password">
        <h2 id="password" className="mb-4 font-display text-lg font-bold">Change password</h2>
        <ActionForm action={changeCustomerPasswordAction} submit="Change password">
          <label className={LABEL}>
            Current password
            <input name="current" type="password" required autoComplete="current-password" className={INPUT} />
          </label>
          <label className={LABEL}>
            New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
          </label>
          <label className={LABEL}>
            Repeat new password
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
          </label>
        </ActionForm>
        <p className="mt-3 text-[13px] text-ink-3">
          Forgot it? <Link href="/forgot-password" className="font-semibold text-primary-text hover:underline">Get a reset link by email</Link>.
        </p>
      </section>

      <section className={PANEL} aria-labelledby="close">
        <h2 id="close" className="font-display text-lg font-bold">Delete your account</h2>
        <p className="mt-2 text-sm text-ink-2">
          Cancelling your plan keeps your login and reports. To delete everything, email <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Close account: ${account.businessName}`)}`} className="font-semibold text-primary-text hover:underline">{SUPPORT_EMAIL}</a> and we will close it and delete your data, as described in our <Link href="/privacy" className="font-semibold text-primary-text hover:underline">privacy policy</Link>.
        </p>
      </section>
    </div>
  );
}
