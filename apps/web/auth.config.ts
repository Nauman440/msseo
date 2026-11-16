import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js settings, shared by the middleware and lib/auth.ts. No database,
 * bcrypt or Redis here: the middleware only reads the signed session cookie.
 * Spec §4: JWT sessions, 7-day expiry, roles admin/member.
 */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  // Behind Coolify's proxy the Host header is the public domain.
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: 'admin' | 'member' | 'customer' }).role ?? 'member';
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as 'admin' | 'member' | 'customer') ?? 'member';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'admin' | 'member' | 'customer'; name?: string | null; email?: string | null };
  }
}
