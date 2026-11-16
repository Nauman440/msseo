import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { findUserById, type TeamUser } from './users';

/**
 * Password-reset links: `<userId>.<expiry>.<signature>`, HMAC-SHA256 with AUTH_SECRET over
 * the user id, expiry and a fingerprint of the current password hash. No table needed;
 * a link stops working after 60 minutes or as soon as the password changes.
 */
const TTL_SECONDS = 60 * 60;
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const fingerprint = (u: TeamUser) => createHash('sha256').update(u.passwordHash).digest('base64url').slice(0, 16);
const sign = (secret: string, id: string, exp: number, fp: string) => createHmac('sha256', secret).update(`reset:${id}.${exp}.${fp}`).digest('base64url');

export function resetToken(user: TeamUser, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${b64(user.id)}.${exp}.${sign(process.env.AUTH_SECRET!, user.id, exp, fingerprint(user))}`;
}

/** The user a valid, unexpired link belongs to, or null. */
export async function userForResetToken(token: string, now = Date.now()): Promise<TeamUser | null> {
  const secret = process.env.AUTH_SECRET;
  const [idPart, expText, sig] = token.split('.');
  if (!secret || !idPart || !expText || !sig) return null;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < now / 1000) return null;
  const id = Buffer.from(idPart, 'base64url').toString('utf8');
  const user = await findUserById(id);
  if (!user || !user.active) return null;
  const expected = Buffer.from(sign(secret, id, exp, fingerprint(user)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? user : null;
}
