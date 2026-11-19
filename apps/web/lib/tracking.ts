import 'server-only';
import { emptyTracking, normDomain, runTrackingAudit, type TrackingManual, type TrackingWorkspace } from '@seo/core';
import { customerAudits } from './customer-data';
import { ga4Access, gscAccess } from './keywords';
import { hit } from './rate-limit';
import { getDoc, saveDoc } from './site-docs';

/** Module 11 · tracking and conversion audit (`SiteDocument` kind "tracking"). Free: our own fetches + Google. */
const KIND = 'tracking';

export async function getTracking(rawDomain: string): Promise<TrackingWorkspace> {
  const domain = normDomain(rawDomain);
  return (await getDoc<TrackingWorkspace>(KIND, domain)) ?? emptyTracking(domain);
}

export async function runTracking(rawDomain: string, by: 'team' | 'customer'): Promise<{ ws?: TrackingWorkspace; problem?: 'too-often' }> {
  const domain = normDomain(rawDomain);
  if (by === 'customer' && !(await hit(`tracking-audit:${domain}`, 3, 24 * 60 * 60)).allowed) return { problem: 'too-often' };
  const [ws, audits, gsc, ga4] = await Promise.all([getTracking(domain), customerAudits(`https://${domain}/`), gscAccess(domain), ga4Access(domain)]);
  const audit = await runTrackingAudit({ domain, report: audits.latest ?? null, gsc, ga4 });
  const next = { ...ws, audit };
  await saveDoc(KIND, domain, next);
  return { ws: next };
}

/** 11.7 Lead quality: filled in by a person and kept across runs. */
export async function saveTrackingManual(rawDomain: string, manual: Omit<TrackingManual, 'updatedAt'>): Promise<void> {
  const ws = await getTracking(rawDomain);
  await saveDoc(KIND, ws.domain, { ...ws, manual: { ...manual, updatedAt: new Date().toISOString() } });
}
