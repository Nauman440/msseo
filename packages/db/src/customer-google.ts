import { refreshGscToken, type AuditRecord } from '@seo/core';
import { prisma, type Prisma } from './client';
import { decryptSecret, encryptSecret, gscAuditAccess } from './gsc';

/**
 * A customer's own Google connection (Search Console + Analytics 4). The agency connection in
 * gsc.ts stays for the team's audits; customer audits use the customer's connection, so the
 * team does not need access to every customer's Google properties.
 */
export type CustomerGoogleSite = { gscProperty: string | null; ga4Property: string | null; ga4Name: string | null; chosenAt: string };
export type CustomerGoogleConnection = { userId: string; googleEmail: string; scopes: string; sites: Record<string, CustomerGoogleSite>; createdAt: Date };

/** Customers can connect when the OAuth client and the encryption key are set (and there is a database). */
export function customerGoogleReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.ENCRYPTION_KEY?.trim() && env.DATABASE_URL?.trim());
}

const toModel = (r: { userId: string; googleEmail: string; scopes: string; sites: Prisma.JsonValue; createdAt: Date }): CustomerGoogleConnection => ({
  userId: r.userId,
  googleEmail: r.googleEmail,
  scopes: r.scopes,
  sites: (r.sites ?? {}) as Record<string, CustomerGoogleSite>,
  createdAt: r.createdAt,
});

export async function getCustomerGoogle(userId: string): Promise<CustomerGoogleConnection | null> {
  const row = await prisma.customerGoogle.findUnique({ where: { userId } });
  return row ? toModel(row) : null;
}

/** Saves (or replaces) the connection; property choices made earlier are kept. */
export async function saveCustomerGoogle(userId: string, c: { email: string; refreshToken: string; scopes: string }): Promise<void> {
  const refreshTokenEnc = encryptSecret(c.refreshToken);
  await prisma.customerGoogle.upsert({
    where: { userId },
    create: { userId, googleEmail: c.email, refreshTokenEnc, scopes: c.scopes },
    update: { googleEmail: c.email, refreshTokenEnc, scopes: c.scopes },
  });
  for (const k of tokens.keys()) if (k.startsWith(`${userId}:`)) tokens.delete(k);
}

/** Sets (or clears, with null) the properties used for one of the customer's websites. */
export async function setCustomerGoogleSite(userId: string, domain: string, choice: Omit<CustomerGoogleSite, 'chosenAt'> | null): Promise<void> {
  const row = await getCustomerGoogle(userId);
  if (!row) throw new Error('Google is not connected');
  const sites = { ...row.sites };
  if (choice) sites[domain] = { ...choice, chosenAt: new Date().toISOString() };
  else delete sites[domain];
  await prisma.customerGoogle.update({ where: { userId }, data: { sites: sites as unknown as Prisma.InputJsonValue } });
}

export async function deleteCustomerGoogle(userId: string): Promise<void> {
  await prisma.customerGoogle.deleteMany({ where: { userId } });
  for (const k of tokens.keys()) if (k.startsWith(`${userId}:`)) tokens.delete(k);
}

const tokens = new Map<string, { token: string; expires: number }>();

/**
 * A fresh access token for the customer's Google account (cached ~45 min). The cache key includes
 * the stored connection itself, so after "Switch account" (saved by another part of the app, which
 * may hold its own copy of this module) an old account's token is never reused.
 */
export async function customerGoogleToken(userId: string): Promise<string> {
  const row = await prisma.customerGoogle.findUnique({ where: { userId } });
  if (!row) throw new Error('Google is not connected for this account.');
  const key = `${userId}:${row.refreshTokenEnc.slice(-24)}`;
  const hit = tokens.get(key);
  if (hit && hit.expires > Date.now()) return hit.token;
  try {
    const token = await refreshGscToken({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim() }, decryptSecret(row.refreshTokenEnc));
    tokens.set(key, { token, expires: Date.now() + 45 * 60_000 });
    return token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|expired|revoked/i.test(msg)) throw new Error('The Google connection has expired or was removed. Connect Google again.');
    throw err;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/**
 * Search Console for an audit: customer audits use the customer's own connection and the
 * property they chose for that website; team audits keep the agency connection.
 */
export async function auditGscAccess(record: Pick<AuditRecord, 'input' | 'createdById'>): Promise<{ gsc?: { accessToken: () => Promise<string> }; property?: string | null }> {
  if (record.input.source !== 'customer' || !record.createdById) return { gsc: gscAuditAccess() };
  if (!customerGoogleReady()) return {};
  const conn = await getCustomerGoogle(record.createdById).catch(() => null);
  const site = conn?.sites[hostOf(record.input.url)];
  if (!conn || !site?.gscProperty) return {};
  const userId = record.createdById;
  return { gsc: { accessToken: () => customerGoogleToken(userId) }, property: site.gscProperty };
}

/** The chosen Search Console property for a customer's website (for new audits), or null. */
export async function customerGscProperty(userId: string, url: string): Promise<string | null> {
  if (!customerGoogleReady()) return null;
  const conn = await getCustomerGoogle(userId).catch(() => null);
  return conn?.sites[hostOf(url)]?.gscProperty ?? null;
}
