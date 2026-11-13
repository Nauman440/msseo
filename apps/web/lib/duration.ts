/** "45s", "2m 05s", "1h 03m". Safe for client and server components. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function secondsBetween(fromIso: string, toIso?: string, now = Date.now()): number {
  const end = toIso ? Date.parse(toIso) : now;
  return Math.max(0, (end - Date.parse(fromIso)) / 1000);
}
