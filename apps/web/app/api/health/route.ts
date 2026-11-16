import { prisma } from '@seo/db';

/**
 * GET /api/health — liveness check for Coolify/Docker. Public; reveals nothing beyond
 * whether the database answers. Always 200, so a database hiccup never restarts the app.
 */
export const dynamic = 'force-dynamic';

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
  return Response.json({ ok: true, database });
}
