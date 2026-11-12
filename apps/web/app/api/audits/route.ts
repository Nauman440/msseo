import { NextResponse } from 'next/server';
import { newAuditSchema } from '@seo/core';
import { ConfigError, startAudit } from '@/lib/audit-runner';

/** POST /api/audits — start an audit (JSON body, same fields as the new-audit form). */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const parsed = newAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    const audit = await startAudit(parsed.data);
    return NextResponse.json({ id: audit.id, url: `/audits/${audit.id}` }, { status: 202 });
  } catch (err) {
    if (err instanceof ConfigError) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
