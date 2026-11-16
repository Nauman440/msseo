import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from '@/auth.config';
import { clear, hit } from './rate-limit';
import { findUserByEmail, normaliseEmail, verifyPassword } from './users';

/** Shown to the user when the login rate limit (5 tries / 15 min per IP + email) is hit. */
export class RateLimitedSignin extends CredentialsSignin {
  override code = 'rate_limited';
}

const credentials = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = normaliseEmail(parsed.data.email);
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const key = `login:${ip}:${email}`;
        if (!(await hit(key, 5, 15 * 60)).allowed) throw new RateLimitedSignin();

        const user = await findUserByEmail(email);
        // Same answer for unknown, disabled and wrong-password, so accounts cannot be probed.
        if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) return null;
        await clear(key);
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
