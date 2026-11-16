import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/forms/AuthForm';
import { userForResetToken } from '@/lib/password-reset';
import { resetPasswordAction } from '../actions';

export const metadata: Metadata = { title: 'Set a new password' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const user = token ? await userForResetToken(token) : null;
  if (!token || !user) {
    return (
      <>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">This link has expired</h1>
        <p className="mt-1.5 text-sm text-ink-2">Reset links work for 60 minutes and only once.</p>
        <Link href="/forgot-password" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-button bg-primary text-base font-extrabold text-primary-ink hover:bg-primary-hover">
          Send me a new link
        </Link>
      </>
    );
  }
  const min = user.role === 'customer' ? 8 : 10;
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Set a new password</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-2">For {user.email}.</p>
      <AuthForm
        action={resetPasswordAction}
        submit="Save and sign in"
        hidden={{ token }}
        fields={[
          { name: 'password', label: 'New password', type: 'password', autoComplete: 'new-password', hint: `At least ${min} characters.` },
          { name: 'confirm', label: 'Repeat new password', type: 'password', autoComplete: 'new-password' },
        ]}
      />
    </>
  );
}
