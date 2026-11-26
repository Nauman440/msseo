/**
 * Without the worker (USE_WORKER unset), the web server calls the WordPress autopilot's clock
 * itself every 15 minutes, through the same signed route the worker uses.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.USE_WORKER === '1' || !process.env.ENCRYPTION_KEY || process.env.NODE_ENV !== 'production') return;
  const { signPrintToken } = await import('@seo/core/print-token');
  const origin = process.env.INTERNAL_APP_URL?.replace(/\/$/, '') || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const tick = async () => {
    try {
      const token = await signPrintToken('autopilot-tick', process.env.ENCRYPTION_KEY!, 300);
      await fetch(`${origin}/api/autopilot/tick`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(280_000) });
    } catch (err) {
      console.error(`[autopilot] tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), 15 * 60_000);
}
