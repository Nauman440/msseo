import type { Metadata } from 'next';
import { MiniScore } from '@/components/signup/MiniScore';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { StepForm } from '@/components/signup/StepForm';
import { SIGNUP_INPUT, SIGNUP_LABEL } from '@/components/signup/styles';
import { domainOf } from '@/lib/accounts';
import { freeAuditSummary, requireOnboardingStep } from '@/lib/signup';
import { saveWebsiteAction } from '../actions';

export const metadata: Metadata = { title: 'Your website' };
export const dynamic = 'force-dynamic';

/** Step 2 · Your website (design 2-your-website.png). */
export default async function WebsitePage() {
  const { account, name } = await requireOnboardingStep(2);
  const audit = await freeAuditSummary(account.sourceAuditId);
  const sameSite = audit && account.website && domainOf(account.website) === audit.domain;
  const firstName = name.split(' ')[0];

  return (
    <SignupShell step={2} plan={account.plan} audit={audit} signedIn>
      <StepHeading step={2} title={account.website ? `Hi ${firstName}, is this your website?` : `Hi ${firstName}, what is your website?`} intro="All our work will focus on this site. Change it if it is not right." />
      <StepForm action={saveWebsiteAction}>
        <label className="flex flex-col gap-1.5">
          <span className={SIGNUP_LABEL}>Website address</span>
          <input name="website" type="text" inputMode="url" autoComplete="url" required defaultValue={account.website ?? ''} placeholder="https://yourbusiness.com" className={SIGNUP_INPUT} />
        </label>
        {sameSite && audit && (
          <div className="flex items-center gap-5 rounded-card border border-border bg-surface p-5">
            <MiniScore score={audit.score} size={68} onLight />
            <div>
              <p className="font-bold">Your free audit found {audit.issues} {audit.issues === 1 ? 'issue' : 'issues'}</p>
              {audit.critical > 0 ? (
                <p className="mt-1 text-sm text-ink-2">
                  <span className="font-bold text-fail-text">{audit.critical} critical</span> {audit.critical === 1 ? 'issue is' : 'issues are'} hurting you most. We start with those.
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-2">We start with the ones that matter most.</p>
              )}
            </div>
          </div>
        )}
      </StepForm>
    </SignupShell>
  );
}
