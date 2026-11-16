import 'server-only';

/**
 * Search Console properties for the new-audit form. Never throws: without a database,
 * setup or connection (or if Google is unreachable) the form simply offers "None".
 */
export async function availableGscProperties(): Promise<{ connected: boolean; properties: string[] }> {
  if (!process.env.DATABASE_URL) return { connected: false, properties: [] };
  try {
    const { getGscConnection, gscProperties, gscSetup } = await import('@seo/db');
    if (!gscSetup().ready || !(await getGscConnection())) return { connected: false, properties: [] };
    return { connected: true, properties: await gscProperties() };
  } catch {
    return { connected: true, properties: [] };
  }
}
