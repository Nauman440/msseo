import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(auth)/actions';
import { Logo } from '@/components/ui/Logo';
import { PLANS, TRIAL_DAYS, type PlanId } from '@/lib/accounts';
import { stripePublishableKey } from '@/lib/billing';
import type { FreeAuditSummary } from '@/lib/signup';
import { STEPS } from '@/lib/signup';
import { cn } from '@/lib/tones';
import { MiniScore } from './MiniScore';

/**
 * Onboarding layout from design-reference/signup: navy sidebar (steps, plan, free audit,
 * reassurances) beside the form. Below lg the sidebar becomes a compact header.
 */
export function SignupShell({
  step,
  plan,
  audit,
  signedIn,
  children,
}: {
  step: number;
  plan: PlanId | null;
  audit: FreeAuditSummary | null;
  signedIn: boolean;
  children: ReactNode;
}) {
  const p = plan ? PLANS[plan] : null;
  const auth = signedIn ? (
    <form action={signOutAction}>
      <button type="submit" className="min-h-10 text-[15px] text-mist-2 hover:text-mist">Log out</button>
    </form>
  ) : (
    <Link href="/login" className="inline-flex min-h-10 items-center text-[15px] text-mist-2 hover:text-mist">Log in</Link>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="flex flex-col bg-night text-mist lg:sticky lg:top-0 lg:h-dvh lg:w-[400px] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 lg:px-6 lg:pt-7">
          <Link href="/" aria-label="MS SCORE home">
            <Logo tone="light" height={30} />
          </Link>
          {auth}
        </div>

        {/* Phones and tablets: one line of progress instead of the full sidebar. */}
        {step > 0 && (
          <p className="px-5 pb-4 text-[13px] text-mist-2 lg:hidden">
            Step {step} of {STEPS.length} · <span className="font-semibold text-mist">{STEPS[step - 1]!.label}</span>
            {p && <> · {p.name} plan</>}
          </p>
        )}

        <div className="hidden flex-1 flex-col px-6 pb-7 lg:flex">
          {step > 0 && (
            <ol className="mt-10 flex flex-col" aria-label="Sign-up steps">
              {STEPS.map((s) => {
                const done = s.n < step;
                const current = s.n === step;
                return (
                  <li key={s.n} className="relative flex items-center gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
                    {s.n < STEPS.length && <span aria-hidden="true" className={cn('absolute left-[17px] top-9 h-6 w-0.5', done ? 'bg-brand' : 'bg-night-line')} />}
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular',
                        done ? 'border-brand bg-brand text-night' : current ? 'border-brand text-brand ring-4 ring-brand/15' : 'border-night-line text-mist-3',
                      )}
                    >
                      {done ? '✓' : s.n}
                    </span>
                    <span className={cn('text-[15px]', current ? 'font-bold text-mist' : done ? 'text-mist' : 'text-mist-3')}>
                      {s.label}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {(p || audit) && (
            <div className="mt-10 rounded-card border border-night-line bg-night-2 p-5">
              {p && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-mist-3">Your plan</p>
                  <p className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="font-display text-xl font-bold">{p.name}</span>
                    <span>
                      <span className="font-display text-2xl font-bold tabular">{p.price}</span> <span className="text-sm text-mist-3">{p.unit}</span>
                    </span>
                  </p>
                  <p className="mt-3 rounded-tile border border-brand/30 bg-brand/10 px-3 py-2 text-[13px] leading-5 text-brand">
                    {stripePublishableKey()
                      ? `✓ Nothing to pay today. Your card is charged only after the ${TRIAL_DAYS}-day free trial; cancel any time before then.`
                      : '✓ Nothing to pay today. You will confirm payment before your plan starts.'}
                  </p>
                </>
              )}
              {audit && (
                <div className={cn('flex items-center gap-4', p && 'mt-4 border-t border-night-line pt-4')}>
                  <MiniScore score={audit.score} />
                  <p className="text-sm text-mist-2">
                    Your free audit for <span className="block break-all font-semibold text-mist">{audit.domain}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          <ul className="mt-auto flex flex-col gap-2.5 pt-10 text-sm text-mist-2">
            {['Nothing changes on your site without your approval', 'Undo any change in one click', 'Cancel anytime'].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden="true" className="text-brand">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main id="main" className="flex flex-1 justify-center px-5 py-10 sm:px-8 lg:py-14">
        <div className="w-full max-w-[600px]">{children}</div>
      </main>
    </div>
  );
}

/** "STEP 1 OF 5 · ABOUT YOU" eyebrow, headline and intro. */
export function StepHeading({ step, title, intro }: { step?: number; title: ReactNode; intro?: ReactNode }) {
  return (
    <header className="mb-8">
      {step && (
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary-text">
          Step {step} of {STEPS.length} · {STEPS[step - 1]!.label}
        </p>
      )}
      <h1 className="mt-2 font-display text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{title}</h1>
      {intro && <p className="mt-3 text-[16px] leading-7 text-ink-2">{intro}</p>}
    </header>
  );
}
