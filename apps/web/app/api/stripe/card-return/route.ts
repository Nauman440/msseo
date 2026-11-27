import { NextResponse, type NextRequest } from 'next/server';
import { getAccountByUserId } from '@/lib/accounts';
import { finishCardSetup } from '@/lib/billing';
import { publicOrigin } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';
import { stepPath } from '@/lib/signup';

export const dynamic = 'force-dynamic';

/**
 * Where Stripe sends the browser when a card needs an extra bank check on another page
 * (?setup_intent=seti_…). Most cards confirm in place and never come here.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') return NextResponse.redirect(`${origin}/login?next=/signup`);
  const account = await getAccountByUserId(user.id);
  const id = req.nextUrl.searchParams.get('setup_intent') ?? '';
  if (!account || !/^seti_[A-Za-z0-9_]+$/.test(id)) return NextResponse.redirect(`${origin}/signup`);
  const r = await finishCardSetup(account, id).catch(() => ({ error: 'failed' }));
  if (r.error) return NextResponse.redirect(`${origin}/signup/connect?payment=failed`);
  return NextResponse.redirect(`${origin}${stepPath(Math.max(2, account.onboardingStep))}`);
}
