import { matchGscProperties, type ReportModel } from '@seo/core';
import { prisma } from './client';
import { customerGoogleReady, customerGoogleToken, getCustomerGoogle } from './customer-google';
import { getGscConnection, gscAccessToken, gscProperties, gscSetup } from './gsc';

/** Google and audit data per website, shared by the action checks (12.6), tracking (11) and monitoring (13). */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

async function ownerOf(domain: string) {
  const owners = await prisma.customerAccount.findMany({ select: { userId: true, website: true, extraWebsites: true } });
  return owners.find((a) => [a.website, ...a.extraWebsites].some((w) => w && hostOf(w) === domain)) ?? null;
}

/** Read access to the site's Search Console: the customer's own connection first, else the agency one. */
export async function searchConsoleFor(domain: string): Promise<{ token: string; property: string } | null> {
  if (customerGoogleReady()) {
    const owner = await ownerOf(domain);
    const conn = owner ? await getCustomerGoogle(owner.userId).catch(() => null) : null;
    const property = conn?.sites[domain]?.gscProperty;
    if (owner && property) return { token: await customerGoogleToken(owner.userId), property };
  }
  if (!gscSetup().ready || !(await getGscConnection())) return null;
  const property = matchGscProperties(await gscProperties(), `https://${domain}/`)[0];
  return property ? { token: await gscAccessToken(), property } : null;
}

/** GA4 for a site: only through the customer's own Google connection (the team has no agency GA4). */
export async function analyticsFor(domain: string): Promise<{ token: string; property: string } | null> {
  if (!customerGoogleReady()) return null;
  const owner = await ownerOf(domain);
  const conn = owner ? await getCustomerGoogle(owner.userId).catch(() => null) : null;
  const property = conn?.sites[domain]?.ga4Property;
  return owner && property ? { token: await customerGoogleToken(owner.userId), property } : null;
}

export async function latestAudit(domain: string): Promise<{ report: ReportModel | null; finishedAt: string | null }> {
  const project = await prisma.project.findUnique({ where: { domain }, select: { id: true } });
  const a = project
    ? await prisma.audit.findFirst({ where: { projectId: project.id, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { report: true, finishedAt: true, createdAt: true } })
    : null;
  return { report: (a?.report as unknown as ReportModel) ?? null, finishedAt: (a?.finishedAt ?? a?.createdAt)?.toISOString() ?? null };
}

/** The two newest finished audits of a site (Module 13 new-errors alert). */
export async function lastTwoAudits(domain: string): Promise<{ latest: { id: string; report: ReportModel } | null; previous: ReportModel | null }> {
  const project = await prisma.project.findUnique({ where: { domain }, select: { id: true } });
  if (!project) return { latest: null, previous: null };
  const rows = await prisma.audit.findMany({ where: { projectId: project.id, status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 2, select: { id: true, report: true } });
  const [a, b] = rows;
  return { latest: a?.report ? { id: a.id, report: a.report as unknown as ReportModel } : null, previous: (b?.report as unknown as ReportModel) ?? null };
}
