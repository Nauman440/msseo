import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { listGscSites, refreshGscToken } from '@seo/core';
import { prisma } from './client';

/**
 * The agency-level Search Console connection (spec §5.5): one Google account whose
 * refresh token is stored AES-256-GCM encrypted with ENCRYPTION_KEY. Used by the web
 * app (Settings, property list) and the worker (audits), so both need the same
 * GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY.
 */

export type GscSetup = { ready: boolean; missing: string[] };

/** Which settings Search Console still needs (names only, never values). */
export function gscSetup(env: NodeJS.ProcessEnv = process.env): GscSetup {
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'].filter((k) => !env[k]?.trim());
  if (!missing.includes('ENCRYPTION_KEY') && !validKey(env.ENCRYPTION_KEY!)) missing.push('ENCRYPTION_KEY (must be 32 random bytes, base64)');
  return { ready: missing.length === 0, missing };
}

function validKey(v: string) {
  try {
    return Buffer.from(v.trim(), 'base64').length === 32;
  } catch {
    return false;
  }
}

const key = () => Buffer.from(process.env.ENCRYPTION_KEY!.trim(), 'base64');

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export async function getGscConnection(): Promise<{ googleEmail: string; createdAt: Date } | null> {
  if (!process.env.DATABASE_URL) return null;
  return prisma.gscConnection.findFirst({ select: { googleEmail: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
}

/** Replaces any existing connection (there is one per installation). */
export async function saveGscConnection(c: { email: string; refreshToken: string; scopes: string }): Promise<void> {
  const enc = encryptSecret(c.refreshToken);
  await prisma.$transaction([prisma.gscConnection.deleteMany({}), prisma.gscConnection.create({ data: { googleEmail: c.email, refreshTokenEnc: enc, scopes: c.scopes } })]);
  cached = null;
}

export async function deleteGscConnection(): Promise<void> {
  await prisma.gscConnection.deleteMany({});
  cached = null;
}

let cached: { token: string; expires: number } | null = null;

/** A fresh access token (cached ~45 min). Throws a readable error when the connection is missing or revoked. */
export async function gscAccessToken(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;
  const row = await prisma.gscConnection.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!row) throw new Error('Search Console is not connected (Settings → Search Console).');
  try {
    const token = await refreshGscToken({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim() }, decryptSecret(row.refreshTokenEnc));
    cached = { token, expires: Date.now() + 45 * 60_000 };
    return token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|expired|revoked/i.test(msg)) throw new Error('The Search Console connection has expired or was revoked. Reconnect it in Settings → Search Console.');
    if (/unsupported state|unable to authenticate/i.test(msg)) throw new Error('The stored Search Console token cannot be read (ENCRYPTION_KEY changed?). Reconnect it in Settings → Search Console.');
    throw err;
  }
}

/** The connected account's properties; empty when not connected. Cached 10 minutes per process. */
let sitesCache: { at: number; sites: string[] } | null = null;
export async function gscProperties(): Promise<string[]> {
  if (!gscSetup().ready || !(await getGscConnection())) return [];
  if (sitesCache && Date.now() - sitesCache.at < 10 * 60_000) return sitesCache.sites;
  const sites = await listGscSites(await gscAccessToken());
  sitesCache = { at: Date.now(), sites };
  return sites;
}

/** For AuditEnv.gsc: present only when Search Console can work in this process. */
export const gscAuditAccess = () => (gscSetup().ready ? { accessToken: gscAccessToken } : undefined);
