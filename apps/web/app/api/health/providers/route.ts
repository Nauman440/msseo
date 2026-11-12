import { NextResponse } from 'next/server';
import { providerConfig } from '@/lib/providers-config';

export const dynamic = 'force-dynamic';

/** Which providers are configured (booleans only — never key values). Feeds Settings → API keys status. */
export function GET() {
  return NextResponse.json(providerConfig().status);
}
