import 'server-only';
import { createOpenAiClient, SUPPORT_LIMITS, supportReply, type SupportContext, type SupportMessage, type SupportReply, type SupportSite } from '@seo/core';
import { accountSites, domainOf, getAccountByUserId, PLANS } from './accounts';
import { getConnection } from './connections';
import { customerAudits } from './customer-data';
import { googleStatus, isConnected } from './customer-google';
import { logUsage } from './keywords';
import { providerConfig } from './providers-config';

/**
 * The customer help assistant (server side): the customer's setup in plain facts (what is connected,
 * when the last audit ran), never their Search Console or Analytics data, then one answer per question.
 * A daily limit per customer keeps OpenAI costs small.
 */
const used = new Map<string, { day: string; n: number }>();

/** Counts one question; false once today's limit is reached (kept in memory, per server). */
export function takeSupportQuota(userId: string, now = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  const u = used.get(userId);
  const n = u && u.day === day ? u.n : 0;
  if (n >= SUPPORT_LIMITS.perDay) return false;
  used.set(userId, { day, n: n + 1 });
  return true;
}

async function siteFacts(userId: string, website: string): Promise<SupportSite> {
  const domain = domainOf(website);
  const [g, conn, audits] = await Promise.all([googleStatus(userId, domain).catch(() => null), getConnection(domain).catch(() => null), customerAudits(website).catch(() => ({ rows: [] }))]);
  const googleConnected = Boolean(g && isConnected(g));
  const last = audits.rows.find((r) => r.status === 'completed');
  const site: SupportSite = {
    domain,
    googleConnected,
    searchConsoleChosen: Boolean(g?.site?.gscProperty),
    analyticsChosen: Boolean(g?.site?.ga4Property),
    website: !conn ? 'not connected' : conn.platform === 'shopify' ? 'shopify' : conn.plugin ? 'wordpress' : 'wordpress without plugin',
    lastAudit: last ? `${last.createdAt.slice(0, 10)}${last.score !== null ? `, score ${last.score}` : ''}` : null,
    nextStep: null,
  };
  site.nextStep = !last
    ? 'run the first audit'
    : !googleConnected
      ? 'connect Google (Search Console and Analytics)'
      : !site.searchConsoleChosen
        ? 'choose the Search Console property'
        : site.website === 'not connected'
          ? 'connect the website (WordPress or Shopify), optional'
          : site.website === 'wordpress without plugin'
            ? 'install the MS SCORE Connector plugin in WordPress'
            : null;
  return site;
}

export async function supportContext(userId: string, name: string, page: string | null): Promise<SupportContext | null> {
  const account = await getAccountByUserId(userId);
  if (!account) return null;
  const trialDaysLeft = account.status === 'trial' ? Math.max(0, Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000)) : null;
  return {
    name,
    plan: PLANS[account.plan]?.name ?? String(account.plan),
    status: account.status,
    trialDaysLeft,
    current: page,
    sites: await Promise.all(accountSites(account).slice(0, 3).map((w) => siteFacts(userId, w))),
  };
}

export async function answerSupport(ctx: SupportContext, messages: SupportMessage[], domain: string | null): Promise<SupportReply> {
  const openai = providerConfig().env?.openai;
  const reply = await supportReply(openai ? createOpenAiClient(openai) : null, messages, ctx, domain);
  if (reply.tokens) await logUsage('openai', reply.tokens);
  return reply;
}
