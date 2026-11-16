import { canViewAudit } from '@/lib/access';
import { NextResponse } from 'next/server';
import { getAuditStatus } from '@/lib/audit-runner';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/status — polled by the progress screen every 3 s (§5.2). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auditId = (await params).id;
  if (!(await canViewAudit(auditId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const audit = await getAuditStatus(auditId);
  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { id, status, progress, steps, error, createdAt, finishedAt } = audit;
  return NextResponse.json({ id, status, progress, steps, error, createdAt, finishedAt, aiPending: audit.report?.aiPending ?? false });
}
