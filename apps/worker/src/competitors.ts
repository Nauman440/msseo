import type { Logger } from 'pino';
import { createCompetitorClient, discoverCompetitors, providerConfig, refreshStrength, sendEmail } from '@seo/core';
import { customerEmailsForDomain, dueCompetitorWorkspaces, logCompetitorUsage, saveCompetitorWorkspace } from '@seo/db';

/**
 * Module 3.9: quarterly competitor refresh. Re-runs discovery (and the strength snapshot for
 * shortlisted competitors) for every workspace that has been run before, and emails the
 * team and the site's customer when new direct or local competitors appear.
 */
export async function refreshCompetitors(log: Logger): Promise<void> {
  const { env } = providerConfig();
  if (!env) {
    log.warn('competitor refresh skipped: DataForSEO is not configured');
    return;
  }
  const workspaces = await dueCompetitorWorkspaces();
  for (const ws of workspaces) {
    let calls = 0;
    const client = createCompetitorClient({ ...env.dataforseo, log: (e) => void (e.provider === 'dataforseo' && calls++) });
    try {
      const found = await discoverCompetitors(client, ws);
      const strong = found.workspace.competitors.some((c) => c.shortlist !== 'none') ? await refreshStrength(client, found.workspace) : { workspace: found.workspace, cost: 0 };
      await saveCompetitorWorkspace(strong.workspace);
      await logCompetitorUsage(calls, found.cost + strong.cost);
      const fresh = strong.workspace.competitors.filter((c) => found.newDomains.includes(c.domain) && (c.type === 'direct' || c.type === 'local'));
      log.info({ domain: ws.domain, competitors: strong.workspace.competitors.length, new: fresh.length }, 'competitors refreshed');
      if (fresh.length) await alert(ws.domain, fresh.map((c) => c.domain), log);
    } catch (err) {
      log.error({ domain: ws.domain, err: err instanceof Error ? err.message : String(err) }, 'competitor refresh failed');
    }
  }
}

async function alert(domain: string, newcomers: string[], log: Logger) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) return;
  const team = (process.env.TEAM_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const to = [...new Set([...team, ...(await customerEmailsForDomain(domain))])];
  const list = newcomers.join(', ');
  const text = `New competitors are showing up in Google for ${domain}: ${list}.

Open the Competitors page to review them and decide whether to shortlist them.

MS SCORE by Morosoft Technologies`;
  const html = `<p>New competitors are showing up in Google for <strong>${domain}</strong>: ${newcomers.map((d) => `<strong>${d}</strong>`).join(', ')}.</p><p>Open the Competitors page to review them and decide whether to shortlist them.</p><p style="color:#9CA3AF;font-size:12px">MS SCORE by Morosoft Technologies</p>`;
  for (const address of to) {
    await sendEmail(key, { from, to: address, subject: `New competitors for ${domain}`, html, text, replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined }).catch((err: unknown) =>
      log.error({ domain, err: err instanceof Error ? err.message : String(err) }, 'competitor alert not sent'),
    );
  }
}
