/** GET /api/health — liveness check for Coolify/Docker. Public; reveals nothing. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
