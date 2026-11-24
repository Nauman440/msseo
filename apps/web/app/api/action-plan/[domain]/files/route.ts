import { normDomain, PLAN_FILES, planFile, planZip, type PlanFile } from '@seo/core';
import { getActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { md: 'text/markdown', json: 'application/json', csv: 'text/csv', txt: 'text/plain' };

/** GET /api/action-plan/[domain]/files?file=plan.md|…|all — the plan's output files (team or the site's customer). */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const ws = await getActions(domain);
  const file = new URL(req.url).searchParams.get('file') ?? 'all';
  if (file === 'all') {
    const zip = planZip(ws);
    if (!zip) return new Response('No plan yet', { status: 404 });
    return new Response(new Blob([zip as Uint8Array<ArrayBuffer>]), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="seo-plan-${domain}.zip"`, 'cache-control': 'no-store' } });
  }
  if (!PLAN_FILES.includes(file as PlanFile)) return new Response('Unknown file', { status: 400 });
  const body = planFile(ws, file as PlanFile);
  if (body === null) return new Response('No plan yet', { status: 404 });
  const ext = file.split('.').pop()!;
  return new Response(body, { headers: { 'content-type': `${TYPES[ext] ?? 'text/plain'}; charset=utf-8`, 'content-disposition': `attachment; filename="${domain}-${file}"`, 'cache-control': 'no-store' } });
}
