import { brokenLinkedUrls, type BacklinkWorkspace } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Per-site JSON documents (Modules 8 and 9), keyed by kind and domain. */
export async function getSiteDocument<T>(kind: string, domain: string): Promise<T | null> {
  const row = await prisma.siteDocument.findUnique({ where: { kind_domain: { kind, domain } } });
  return row ? (row.data as unknown as T) : null;
}

export async function saveSiteDocument(kind: string, domain: string, data: unknown): Promise<void> {
  const json = data as Prisma.InputJsonValue;
  await prisma.siteDocument.upsert({ where: { kind_domain: { kind, domain } }, create: { kind, domain, data: json }, update: { data: json } });
}

/** Rule 1.5.7 (worker audits): backlinked pages that are broken, from the latest backlink audit. */
export async function backlinkBrokenFor(url: string): Promise<string[]> {
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return [];
  }
  const ws = await getSiteDocument<BacklinkWorkspace>('backlinks', domain).catch(() => null);
  return brokenLinkedUrls(ws?.audit);
}
