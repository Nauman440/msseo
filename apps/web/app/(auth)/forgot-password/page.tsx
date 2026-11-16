import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/forms/AuthForm';
import { forgotPasswordAction } from '../actions';

export const metadata: Metadata = { title: 'Forgot password' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Forgot your password?</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-2">Enter your email and we will send you a link to set a new one.</p>
      <AuthForm action={forgotPasswordAction} submit="Send me a link" fields={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'username' }]} />
      <p className="mt-6 text-[13px] text-ink-3">
        Remembered it? <Link href="/login" className="font-semibold text-primary-text underline">Sign in</Link>
      </p>
    </>
  );
}
