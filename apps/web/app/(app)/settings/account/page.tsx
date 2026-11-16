import type { Metadata } from 'next';
import { ActionForm } from '@/components/forms/ActionForm';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { requireUser } from '@/lib/session';
import { changePasswordAction } from '../actions';

export const metadata: Metadata = { title: 'Your account' };
export const dynamic = 'force-dynamic';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const LABEL = 'flex flex-col gap-1.5 text-sm font-semibold';

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <Container className="flex max-w-2xl flex-col gap-8 py-12">
      <SectionHeader align="left" eyebrow="Settings" title="Your account" intro={me.email ? `Signed in as ${me.email} (${me.role}).` : 'Login is not switched on in this environment.'} />
      {me.id && (
        <section className="rounded-panel border border-border bg-surface p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Change password</h2>
          <ActionForm action={changePasswordAction} submit="Change password">
            <label className={LABEL}>
              Current password
              <input name="current" type="password" required autoComplete="current-password" className={INPUT} />
            </label>
            <label className={LABEL}>
              New password
              <input name="password" type="password" required minLength={10} autoComplete="new-password" className={INPUT} />
            </label>
            <label className={LABEL}>
              Repeat new password
              <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={INPUT} />
            </label>
          </ActionForm>
        </section>
      )}
    </Container>
  );
}
