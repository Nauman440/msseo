import { NextResponse } from 'next/server';
import { getAuditStatus } from '@/lib/audit-runner';

export const dynamic = 'force-dynamic';

/** GET /api/free/[id]/status — progress of a free (public) audit only; team audits answer 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const audit = await getAuditStatus((await params).id);
  if (!audit || audit.input.source !== 'public') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { id, status, progress, steps, error, createdAt, finishedAt } = audit;
  return NextResponse.json({ id, status, progress, steps, error, createdAt, finishedAt });
}
