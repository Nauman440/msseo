import { NextResponse } from 'next/server';
import { verifyPrintToken } from '@seo/core/print-token';
import { autopilotTick } from '@/lib/autopilot-tick';

/**
 * The WordPress autopilot's clock, called every 15 minutes by the worker (job "wp-autopilot-tick").
 * Authorised by a 5-minute token signed with ENCRYPTION_KEY (the same key the worker has).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const key = process.env.ENCRYPTION_KEY;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!key || !token || !(await verifyPrintToken(token, 'autopilot-tick', key).catch(() => false))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  return NextResponse.json(await autopilotTick());
}
