import { cleanConversation, type SupportMessage } from '@seo/core';
import { getAccountByUserId } from '@/lib/accounts';
import { emailLayout, mailReady, notifyTeam } from '@/lib/mailer';
import { getSessionUser } from '@/lib/session';
import { SUPPORT_EMAIL } from '@/lib/site';

export const dynamic = 'force-dynamic';

const sent = new Map<string, number>();

/**
 * POST /api/support/escalate { messages, site?, note? } — "Ask a person": emails the conversation to the team
 * (TEAM_NOTIFY_EMAIL) with the customer's email to reply to. Once every 10 minutes per customer.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') return Response.json({ error: 'Sign in as a customer' }, { status: 401 });
  let body: { messages?: SupportMessage[]; site?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  const last = sent.get(user.id) ?? 0;
  if (Date.now() - last < 10 * 60_000) return Response.json({ ok: true, message: 'Your question is already with our team. We reply by email.' });
  const convo = cleanConversation(Array.isArray(body.messages) ? body.messages : []);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!convo.length && !note) return Response.json({ error: 'Write your question first' }, { status: 400 });
  if (!mailReady() || !process.env.TEAM_NOTIFY_EMAIL?.trim()) {
    return Response.json({ ok: false, message: `Please email us at ${SUPPORT_EMAIL} and we will help.` });
  }
  const account = await getAccountByUserId(user.id);
  const site = typeof body.site === 'string' ? body.site.slice(0, 200) : account?.website ?? '';
  await notifyTeam(
    `Help request from ${account?.businessName || user.name} (${site})`,
    emailLayout({
      heading: 'A customer asked for help',
      paragraphs: [
        `Customer: ${user.name} <${user.email ?? 'no email'}> · ${account?.businessName ?? ''} · website: ${site}`,
        ...(note ? [`Their note: ${note}`] : []),
        ...convo.map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`),
        'Reply to the customer by email.',
      ],
    }),
  );
  sent.set(user.id, Date.now());
  return Response.json({ ok: true, message: 'Sent to our team. We reply by email, usually within one working day.' });
}
