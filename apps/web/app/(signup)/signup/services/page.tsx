import type { Metadata } from 'next';
import { SignupShell, StepHeading } from '@/components/signup/SignupShell';
import { StepForm } from '@/components/signup/StepForm';
import { TagInput } from '@/components/signup/TagInput';
import { freeAuditSummary, requireOnboardingStep, stepPath } from '@/lib/signup';
import { saveServicesAction } from '../actions';

export const metadata: Metadata = { title: 'Your services' };
export const dynamic = 'force-dynamic';

/** Step 4 · Your services (design 4-your-services.png). */
export default async function ServicesPage() {
  const { account } = await requireOnboardingStep(4);
  const audit = await freeAuditSummary(account.sourceAuditId);
  return (
    <SignupShell step={4} plan={account.plan} audit={audit} signedIn>
      <StepHeading step={4} title="What do you do best?" intro="Add your services and the searches you want to be found for. We build your pages and keywords around them." />
      <StepForm action={saveServicesAction} backHref={stepPath(3)}>
        <TagInput name="services" label="Your services" hint="Type a service and press Enter." placeholder="For example: AC repair" initial={account.services} />
        <TagInput name="keywords" label="Keywords you want to rank for" hint="Searches your customers type into Google. Type one and press Enter. We always keep these and find more." placeholder="For example: emergency AC repair Dallas" initial={account.keywords ?? []} optional />
        <TagInput name="competitors" label="Competitors you know about" hint="Names or websites. We will find others too." placeholder="For example: competitor.com" initial={account.competitors} optional />
      </StepForm>
    </SignupShell>
  );
}
