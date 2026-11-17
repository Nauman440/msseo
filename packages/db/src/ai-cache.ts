import type { AiCache } from '@seo/core';
import { prisma, type Prisma } from './client';

/** Postgres-backed cache for AI check results (step 7). Entries older than 90 days are ignored. */
export const dbAiCache: AiCache = {
  async get(key) {
    const row = await prisma.aiCache.findUnique({ where: { key } });
    if (!row || Date.now() - row.createdAt.getTime() > 90 * 86_400_000) return undefined;
    return row.value;
  },
  async set(key, value) {
    await prisma.aiCache.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue, createdAt: new Date() } });
  },
};
