import { NextResponse } from 'next/server';
import { getAuditStatus } from '@/lib/audit-runner';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/status — polled by the progress screen every 3 s (§5.2). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const audit = await getAuditStatus((await params).id);
  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { id, status, progress, steps, error, createdAt, finishedAt } = audit;
  return NextResponse.json({ id, status, progress, steps, error, createdAt, finishedAt });
}
