import { gscSetup, prisma } from '@seo/db';
import { workerMode } from '@/lib/audit-runner';

/**
 * GET /api/health — liveness check for Coolify/Docker. Public; reveals only whether the
 * database answers and how audits run (in the worker, with how many workers connected,
 * or inside the web app), and whether Search Console is configured on this app (yes/no only,
 * never which setting is missing). Always 200, so a database or Redis hiccup never restarts the app.
 */
export const dynamic = 'force-dynamic';

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export async function GET() {
  let database: 'connected' | 'not configured' | 'error' = 'not configured';
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'error';
    }
  }
  const searchConsole = gscSetup().ready ? 'configured' : 'not configured';
  if (!workerMode()) return Response.json({ ok: true, database, searchConsole, audits: 'in-process' });

  let workers: number | 'error';
  try {
    const { auditWorkerCount } = await import('@seo/db/queue');
    workers = await withTimeout(auditWorkerCount(), 3_000);
  } catch {
    workers = 'error';
  }
  return Response.json({ ok: true, database, searchConsole, audits: 'worker', workers });
}
