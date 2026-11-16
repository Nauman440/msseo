import 'server-only';
import { AUDIT_STEPS, type NewAuditInput, type ReportModel, type StepId, type StepState } from '@seo/core';
import { Prisma, prisma } from '@seo/db';
import type { AuditRecord } from './store-file';
import * as fileStore from './store-file';

/**
 * Postgres audit store (Prisma). Same shape as the JSON file store, mapped onto the
 * spec's tables: Project (one per client domain), Audit, AuditStep and, once an audit
 * completes, RuleResultRow (its issues, for "new since last audit" comparisons later).
 */

const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, '').toLowerCase();

async function projectIdFor(url: string): Promise<string> {
  const domain = domainOf(url);
  const project = await prisma.project.upsert({ where: { domain }, create: { domain, name: domain }, update: {} });
  return project.id;
}

function auditColumns(r: AuditRecord) {
  return {
    url: r.input.url,
    audience: r.input.audience,
    crawlLimit: r.input.pageLimit,
    notifyEmail: r.input.notifyEmail ?? null,
    jsRendering: r.input.jsRendering,
    auditMode: r.input.auditMode ?? 'quick',
    aiRecommendations: r.input.aiRecommendations ?? false,
    gscProperty: r.input.gscProperty ?? null,
    input: r.input as unknown as Prisma.InputJsonValue,
    status: r.status,
    progress: r.progress,
    error: r.error ?? null,
    costUsd: r.costUsd ?? null,
    pagesCrawled: r.report?.pagesCrawled ?? null,
    overallScore: r.report?.overall.score ?? null,
    categoryScores: r.report ? (r.report.categories as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    report: r.report ? (r.report as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    startedAt: new Date(r.createdAt),
    finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
  };
}

const stepWrites = (r: AuditRecord) =>
  r.steps.map((s) =>
    prisma.auditStep.upsert({
      where: { auditId_name: { auditId: r.id, name: s.id } },
      create: { auditId: r.id, name: s.id, status: s.state, detail: s.detail ?? null, startedAt: s.startedAt ? new Date(s.startedAt) : null, finishedAt: s.finishedAt ? new Date(s.finishedAt) : null },
      update: { status: s.state, detail: s.detail ?? null, startedAt: s.startedAt ? new Date(s.startedAt) : null, finishedAt: s.finishedAt ? new Date(s.finishedAt) : null },
    }),
  );

/** Issues of a completed audit as RuleResultRow (replaced on each completed save). */
const resultWrites = (r: AuditRecord) =>
  r.status === 'completed' && r.report?.issues
    ? [
        prisma.ruleResultRow.deleteMany({ where: { auditId: r.id } }),
        prisma.ruleResultRow.createMany({
          data: r.report.issues.map((i) => ({
            auditId: r.id,
            ruleId: i.ruleId,
            status: i.status,
            severity: i.severity,
            affectedCount: i.affectedCount ?? null,
            applicableCount: i.applicableCount ?? null,
            examples: i.urls.map((url) => ({ url })) as Prisma.InputJsonValue,
            message: i.message as unknown as Prisma.InputJsonValue,
          })),
        }),
      ]
    : [];

export async function createAudit(record: AuditRecord): Promise<void> {
  await importFileAuditsOnce();
  const projectId = await projectIdFor(record.input.url);
  await prisma.$transaction([
    prisma.audit.create({ data: { id: record.id, projectId, createdById: record.createdById ?? null, createdAt: new Date(record.createdAt), ...auditColumns(record) } }),
    ...stepWrites(record),
  ]);
}

export async function saveAudit(record: AuditRecord): Promise<void> {
  await prisma.$transaction([prisma.audit.update({ where: { id: record.id }, data: auditColumns(record) }), ...stepWrites(record), ...resultWrites(record)]);
}

type AuditRow = Prisma.AuditGetPayload<{ include: { steps: true } }>;

function toRecord(a: AuditRow): AuditRecord {
  const byName = new Map(a.steps.map((s) => [s.name, s]));
  return {
    id: a.id,
    input: a.input as unknown as NewAuditInput,
    status: a.status === 'completed' || a.status === 'failed' ? a.status : 'running',
    progress: a.progress,
    steps: AUDIT_STEPS.map((def) => {
      const s = byName.get(def.id);
      return {
        id: def.id as StepId,
        label: def.label,
        state: (s?.status ?? 'queued') as StepState,
        detail: s?.detail ?? undefined,
        startedAt: s?.startedAt?.toISOString(),
        finishedAt: s?.finishedAt?.toISOString(),
      };
    }),
    error: a.error ?? undefined,
    report: (a.report ?? undefined) as ReportModel | undefined,
    costUsd: a.costUsd ? Number(a.costUsd) : undefined,
    createdAt: a.createdAt.toISOString(),
    finishedAt: a.finishedAt?.toISOString(),
  };
}

export async function getAudit(id: string): Promise<AuditRecord | null> {
  await importFileAuditsOnce();
  const a = await prisma.audit.findUnique({ where: { id }, include: { steps: true } });
  return a ? toRecord(a) : null;
}

export async function listAudits(limit = 20): Promise<AuditRecord[]> {
  await importFileAuditsOnce();
  const rows = await prisma.audit.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { steps: true } });
  return rows.map(toRecord);
}

/** Projects (client domains) with their audit count and latest audit, newest activity first. */
export async function listProjects(limit = 50) {
  await importFileAuditsOnce();
  const projects = await prisma.project.findMany({
    take: limit,
    include: { _count: { select: { audits: true } }, audits: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, overallScore: true, status: true } } },
  });
  return projects
    .map((p) => ({ id: p.id, domain: p.domain, name: p.name, audits: p._count.audits, latest: p.audits[0] ?? null }))
    .sort((a, b) => (b.latest?.createdAt.getTime() ?? 0) - (a.latest?.createdAt.getTime() ?? 0));
}

/**
 * One-time migration: audits saved as JSON files (before Postgres) are copied into the
 * database the first time the database store is used. Idempotent: existing ids are skipped.
 */
const importState = globalThis as unknown as { __auditImport?: Promise<void> };
function importFileAuditsOnce(): Promise<void> {
  importState.__auditImport ??= (async () => {
    try {
      const files = await fileStore.listAudits(10_000);
      if (!files.length) return;
      const existing = new Set((await prisma.audit.findMany({ where: { id: { in: files.map((f) => f.id) } }, select: { id: true } })).map((a) => a.id));
      for (const r of files.filter((f) => !existing.has(f.id))) {
        // Interrupted runs from the file era cannot resume: keep them as failed.
        const record: AuditRecord = r.status === 'running' ? { ...r, status: 'failed', error: 'Interrupted before the move to the database.' } : r;
        const projectId = await projectIdFor(record.input.url);
        await prisma.$transaction([
          prisma.audit.create({ data: { id: record.id, projectId, createdAt: new Date(record.createdAt), ...auditColumns(record) } }),
          ...stepWrites(record),
          ...resultWrites(record),
        ]);
      }
    } catch (err) {
      importState.__auditImport = undefined; // retry on the next request
      throw err;
    }
  })();
  return importState.__auditImport;
}
