import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/forms/AuthForm';
import { authEnabled, getSessionUser } from '@/lib/session';
import { countUsers } from '@/lib/users';
import { loginAction } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const next = (await searchParams).next ?? '/dashboard';
  // Without AUTH_SECRET (local development) there is nothing to sign in to.
  if (!authEnabled()) redirect('/dashboard');
  const user = await getSessionUser();
  if (user) redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  const firstRun = (await countUsers()) === 0;

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Sign in</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-2">Sign in to your MS SCORE account.</p>
      {firstRun ? (
        <p className="rounded-control bg-primary-soft px-3.5 py-3 text-sm text-primary-heading">
          No accounts exist yet.{' '}
          <Link href="/setup" className="font-bold underline">
            Create the first admin
          </Link>{' '}
          (the team&apos;s shared password is needed once).
        </p>
      ) : (
        <AuthForm
          action={loginAction}
          submit="Sign in"
          hidden={{ next }}
          fields={[
            { name: 'email', label: 'Email', type: 'email', autoComplete: 'username' },
            { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
          ]}
        />
      )}
      <p className="mt-6 text-[13px] text-ink-3">
        <Link href="/forgot-password" className="font-semibold text-primary-text underline">
          Forgot your password?
        </Link>
      </p>
    </>
  );
}
