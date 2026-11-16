import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/forms/AuthForm';
import { authEnabled } from '@/lib/session';
import { countUsers } from '@/lib/users';
import { setupAction } from '../actions';

export const metadata: Metadata = { title: 'Create the first admin' };
export const dynamic = 'force-dynamic';

/**
 * One-time first-admin setup. Behind the team's shared PREVIEW_PASSWORD (middleware)
 * and only while no account exists; afterwards it sends people to sign in.
 */
export default async function SetupPage() {
  if ((await countUsers()) > 0) redirect('/login');
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Create the first admin</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-2">This account can add the rest of the team. This page disappears once it exists.</p>
      {authEnabled() ? (
        <AuthForm
          action={setupAction}
          submit="Create admin and sign in"
          fields={[
            { name: 'name', label: 'Your name', type: 'text', autoComplete: 'name' },
            { name: 'email', label: 'Email', type: 'email', autoComplete: 'username' },
            { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: 'At least 10 characters.' },
            { name: 'confirm', label: 'Repeat password', type: 'password', autoComplete: 'new-password' },
          ]}
        />
      ) : (
        <p className="rounded-control bg-warn-bg px-3.5 py-3 text-sm text-fail-text">
          Login is not switched on yet: add <code>AUTH_SECRET</code> to the server environment and redeploy, then reload this page.
        </p>
      )}
    </>
  );
}
