import { newAuditRecord, newAuditSchema } from '@seo/core';
import { insertAuditRecord } from './audits';
import { prisma } from './client';

/**
 * Weekly re-audit (step 8): customers who finished onboarding, whose trial is still
 * running or whose plan is active, and who were not auto-audited in the last 6 days.
 */
export async function dueCustomerSites(now = new Date()) {
  const sixDaysAgo = new Date(now.getTime() - 6 * 86_400_000);
  return prisma.customerAccount.findMany({
    where: {
      onboardedAt: { not: null },
      website: { not: null },
      user: { active: true },
      OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: now } }],
      AND: [{ OR: [{ lastAutoAuditAt: null }, { lastAutoAuditAt: { lt: sixDaysAgo } }] }],
    },
    select: { id: true, userId: true, website: true },
  });
}

/** Creates a queued customer audit of their website and records the run; returns the audit id. */
export async function createWeeklyCustomerAudit(account: { id: string; userId: string; website: string | null }, now = new Date()): Promise<string> {
  const input = newAuditSchema.parse({ url: account.website, audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, source: 'customer' });
  const record = newAuditRecord(input, account.userId);
  await insertAuditRecord(record);
  await prisma.customerAccount.update({ where: { id: account.id }, data: { lastAutoAuditAt: now } });
  return record.id;
}
