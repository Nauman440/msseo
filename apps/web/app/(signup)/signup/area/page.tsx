import type { Metadata } from 'next';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { StepForm } from '@/components/signup/StepForm';
import { TagInput } from '@/components/signup/TagInput';
import { SIGNUP_INPUT, SIGNUP_LABEL } from '@/components/signup/styles';
import { freeAuditSummary, requireOnboardingStep, stepPath } from '@/lib/signup';
import { saveAreaAction } from '../actions';

export const metadata: Metadata = { title: 'Your area' };
export const dynamic = 'force-dynamic';

const COUNTRIES = ['Pakistan', 'United States', 'United Kingdom', 'United Arab Emirates', 'Saudi Arabia', 'Canada', 'Australia', 'India', 'Qatar', 'Germany'];
const LANGUAGES = ['English', 'Urdu', 'Arabic', 'Spanish', 'French', 'Other'];

/** Step 3 · Your area (design 3-your-area.png). */
export default async function AreaPage() {
  const { account } = await requireOnboardingStep(3);
  const audit = await freeAuditSummary(account.sourceAuditId);
  const language = account.language ?? 'English';

  return (
    <SignupShell step={3} plan={account.plan} audit={audit} signedIn>
      <StepHeading step={3} title="Where are your customers?" intro="We will target searches from people in the places you serve." />
      <StepForm action={saveAreaAction} backHref={stepPath(2)}>
        <label className="flex flex-col gap-1.5">
          <span className={SIGNUP_LABEL}>Country</span>
          <input name="country" list="countries" autoComplete="country-name" required defaultValue={account.country ?? ''} className={SIGNUP_INPUT} />
          <datalist id="countries">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <TagInput name="areas" label="Cities and areas you serve" hint="Type a place and press Enter. Add as many as you like." placeholder="For example: Islamabad" initial={account.areas} />
        <label className="flex cursor-pointer items-center gap-3 text-[15px] font-semibold text-primary-text">
          <input type="checkbox" name="otherCountries" defaultChecked={account.otherCountries} className="size-4 accent-primary" />I also serve customers in other countries
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className={`${SIGNUP_LABEL} mb-2`}>Your website is in</legend>
          <div className="flex flex-wrap gap-2.5">
            {LANGUAGES.map((l) => (
              <label key={l} className="cursor-pointer">
                <input type="radio" name="language" value={l} defaultChecked={l === language} className="peer sr-only" />
                <span className="inline-flex min-h-11 items-center rounded-full border border-border-strong bg-surface px-5 text-[15px] font-semibold peer-checked:border-night peer-checked:bg-night peer-checked:text-mist peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                  {l}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </StepForm>
    </SignupShell>
  );
}
