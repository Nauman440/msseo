import { NextResponse, type NextRequest } from 'next/server';
import { getAccountByUserId } from '@/lib/accounts';
import { billingError, portalUrl } from '@/lib/billing';
import { publicOrigin } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** "Manage payment": opens Stripe's billing portal (card, invoices) for the signed-in customer. */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') return NextResponse.redirect(`${origin}/login?next=/my/account`);
  const account = await getAccountByUserId(user.id);
  if (!account) return NextResponse.redirect(`${origin}/signup`);
  try {
    return NextResponse.redirect(await portalUrl(account, `${origin}/my/account#plan`));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'stripe portal failed', userId: user.id, error: billingError(err) }));
    return NextResponse.redirect(`${origin}/my/account?billing=portal#plan`);
  }
}
