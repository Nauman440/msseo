import 'server-only';
import { verifyPrintToken } from '@seo/core/print-token';
import { domainOf, getAccountByUserId } from './accounts';
import { getAudit } from './audit-store';
import { getSessionUser } from './session';
import { isTeamRole } from './users';

/**
 * Who may open an audit's report, PDF, exports and status:
 *  - team members (admin/member, or everyone in local development): every audit;
 *  - customers: audits of their own website's domain only;
 *  - nobody signed in: only with a valid signed print token (the emailed PDF).
 * Free (public) audits have their own pages under /free and are not opened here.
 * Callers answer 404 when this returns false, so audit ids cannot be probed.
 */
export async function canViewAudit(auditId: string, printToken?: string | null): Promise<boolean> {
  const user = await getSessionUser();
  if (user && isTeamRole(user.role)) return true;
  if (user?.role === 'customer' && user.id) {
    if (auditId === 'demo') return true;
    const [account, audit] = await Promise.all([getAccountByUserId(user.id), getAudit(auditId)]);
    return Boolean(account?.website && audit && domainOf(audit.input.url) === domainOf(account.website));
  }
  if (printToken && process.env.ENCRYPTION_KEY) return verifyPrintToken(printToken, auditId, process.env.ENCRYPTION_KEY).catch(() => false);
  return false;
}

export const notFound = () => new Response('Report not found', { status: 404 });
