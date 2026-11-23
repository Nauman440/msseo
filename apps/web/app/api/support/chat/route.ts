import { normDomain, type SupportMessage } from '@seo/core';
import { getSessionUser } from '@/lib/session';
import { answerSupport, supportContext, takeSupportQuota } from '@/lib/support';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/chat { messages: [{ role, text }], site?, page? } — the help assistant's answer to the
 * customer's last message. Customers only; 30 questions a day each.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') return Response.json({ error: 'Sign in as a customer' }, { status: 401 });
  let body: { messages?: SupportMessage[]; site?: string; page?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return Response.json({ error: 'Ask a question first' }, { status: 400 });
  const ctx = await supportContext(user.id, user.name, typeof body.page === 'string' ? body.page.slice(0, 200) : null);
  if (!ctx) return Response.json({ error: 'No account' }, { status: 404 });
  if (!takeSupportQuota(user.id)) {
    return Response.json({ answer: 'You have asked a lot of questions today. Press "Ask a person" and our team will reply by email, or try again tomorrow.', links: [], suggestions: [], escalate: true, ai: false });
  }
  // Only one of the customer's own websites can be the one being viewed.
  const wanted = typeof body.site === 'string' ? normDomain(body.site) : null;
  const domain = ctx.sites.find((s) => s.domain === wanted)?.domain ?? ctx.sites[0]?.domain ?? null;
  const reply = await answerSupport(ctx, body.messages, domain);
  return Response.json({ answer: reply.answer, links: reply.links, suggestions: reply.suggestions, escalate: reply.escalate, ai: reply.ai });
}
