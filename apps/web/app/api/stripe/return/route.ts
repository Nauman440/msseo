import { NextResponse, type NextRequest } from 'next/server';
import { finishCheckout } from '@/lib/billing';
import { publicOrigin } from '@/lib/google-oauth';
import { completeOnboarding } from '@/lib/onboarding';
import { getSessionUser } from '@/lib/session';
import { FINISHED } from '@/lib/signup';

export const dynamic = 'force-dynamic';

/**
 * Stripe Checkout sends the customer here (?session_id=). The session is read back from
 * Stripe and must be this customer's; then sign-up finishes (or, for a restarted plan, the
 * account page shows the result).
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const user = await getSessionUser();
  const sessionId = req.nextUrl.searchParams.get('session_id') ?? '';
  if (!user?.id || user.role !== 'customer') return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`/api/stripe/return?session_id=${sessionId}`)}`);
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return NextResponse.redirect(`${origin}/my/account?billing=error#plan`);
  const r = await finishCheckout(sessionId, user.id);
  if (!r.account) {
    console.error(JSON.stringify({ level: 'error', msg: 'stripe checkout return failed', userId: user.id, error: r.error }));
    return NextResponse.redirect(`${origin}/signup/connect?payment=failed`);
  }
  if (r.account.onboardingStep < FINISHED) {
    await completeOnboarding({ id: user.id, name: user.name, email: user.email });
    return NextResponse.redirect(`${origin}/my?welcome=1`);
  }
  return NextResponse.redirect(`${origin}/my/account?billing=ok#plan`);
}
