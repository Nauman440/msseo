import type { Metadata } from 'next';

// Sign-up steps are personal: never in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
