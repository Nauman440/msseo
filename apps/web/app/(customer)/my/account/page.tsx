import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/forms/ActionForm';
import { TagInput } from '@/components/signup/TagInput';
import { PlanSettings } from '@/components/customer/PlanSettings';
import { accountSites, getAccountByUserId } from '@/lib/accounts';
import { requireCustomer } from '@/lib/session';
import { SUPPORT_EMAIL } from '@/lib/site';
import { changeCustomerPasswordAction, saveBusinessAction, saveDetailsAction } from './actions';

export const metadata: Metadata = { title: 'Account settings' };
export const dynamic = 'force-dynamic';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const LABEL = 'flex flex-col gap-1.5 text-sm font-semibold';
const PANEL = 'rounded-panel border border-border bg-surface p-6';
const COUNTRIES = ['Pakistan', 'United States', 'United Kingdom', 'United Arab Emirates', 'Saudi Arabia', 'Canada', 'Australia', 'India', 'Qatar', 'Germany'];
const LANGUAGES = ['English', 'Urdu', 'Arabic', 'Spanish', 'French', 'Other'];

/** Customer account settings: plan (switch, cancel, restart), details, business answers, password. */
export default async function CustomerAccountPage() {
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

      <PlanSettings account={account} sites={sites} />

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
        <h2 id="business" className="mb-4 font-display text-lg font-bold">Your business</h2>
        <ActionForm action={saveBusinessAction} submit="Save business details">
          <label className={LABEL}>
            Country
            <input name="country" list="account-countries" required autoComplete="country-name" defaultValue={account.country ?? ''} className={INPUT} />
            <datalist id="account-countries">
              {COUNTRIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <TagInput name="areas" label="Cities and areas you serve" hint="Type a place and press Enter." placeholder="For example: Islamabad" initial={account.areas} optional />
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
            <input type="checkbox" name="otherCountries" defaultChecked={account.otherCountries} className="size-4 accent-primary" />I also serve customers in other countries
          </label>
          <label className={LABEL}>
            Your website is in
            <select name="language" defaultValue={account.language ?? 'English'} className={INPUT}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <TagInput name="services" label="Your services" hint="What you sell. Type one and press Enter." placeholder="For example: AC repair" initial={account.services} />
          <TagInput name="competitors" label="Competitors you know about" hint="Their websites or names." placeholder="For example: rival.com" initial={account.competitors} optional />
        </ActionForm>
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
