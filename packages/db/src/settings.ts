import { resolveSettings, type AppSettings } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Admin settings in the Setting table (one row per key), merged over the defaults. */
export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  return resolveSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export async function saveSettings(values: AppSettings): Promise<void> {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } }),
    ),
  );
}

/** Admin: deletes an audit with its steps, issues and raw data (cascade). Returns false when it did not exist. */
export async function deleteAuditRecord(id: string): Promise<boolean> {
  const { count } = await prisma.audit.deleteMany({ where: { id } });
  return count > 0;
}
