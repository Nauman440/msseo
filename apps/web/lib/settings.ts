import 'server-only';
import { DEFAULT_SETTINGS, type AppSettings } from '@seo/core';

/** Admin settings (spec §4): from Postgres when there is a database, otherwise the defaults. Never throws. */
export async function appSettings(): Promise<AppSettings> {
  if (!process.env.DATABASE_URL) return DEFAULT_SETTINGS;
  try {
    const { getSettings } = await import('@seo/db');
    return await getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}
