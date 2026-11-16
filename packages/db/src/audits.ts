import { AUDIT_STEPS, type AuditRecord, type NewAuditInput, type ReportModel, type StepId, type StepState } from '@seo/core';
import { Prisma, prisma } from './client';

/**
 * Postgres audit store (Prisma), shared by apps/web and apps/worker. Mapped onto the
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

/** Inserts a new audit (its Project is created on first sight of the domain). */
export async function insertAuditRecord(record: AuditRecord): Promise<void> {
  const projectId = await projectIdFor(record.input.url);
  await prisma.$transaction([
    prisma.audit.create({ data: { id: record.id, projectId, createdById: record.createdById ?? null, createdAt: new Date(record.createdAt), ...auditColumns(record) } }),
    ...stepWrites(record),
    ...resultWrites(record),
  ]);
}

export async function saveAuditRecord(record: AuditRecord): Promise<void> {
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
    ...(a.createdById ? { createdById: a.createdById } : {}),
    createdAt: a.createdAt.toISOString(),
    finishedAt: a.finishedAt?.toISOString(),
  };
}

export async function getAuditRecord(id: string): Promise<AuditRecord | null> {
  const a = await prisma.audit.findUnique({ where: { id }, include: { steps: true } });
  return a ? toRecord(a) : null;
}

export async function listAuditRecords(limit = 20): Promise<AuditRecord[]> {
  const rows = await prisma.audit.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { steps: true } });
  return rows.map(toRecord);
}

/** Projects (client domains) with their audit count and latest audit, newest activity first. */
export async function listProjects(limit = 50) {
  const projects = await prisma.project.findMany({
    take: limit,
    include: { _count: { select: { audits: true } }, audits: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, overallScore: true, status: true } } },
  });
  return projects
    .map((p) => ({ id: p.id, domain: p.domain, name: p.name, audits: p._count.audits, latest: p.audits[0] ?? null }))
    .sort((a, b) => (b.latest?.createdAt.getTime() ?? 0) - (a.latest?.createdAt.getTime() ?? 0));
}

/** Which of these audit ids already exist (used by the one-time file import in apps/web). */
export async function existingAuditIds(ids: string[]): Promise<Set<string>> {
  const rows = await prisma.audit.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return new Set(rows.map((a) => a.id));
}

/** One project with its audits, oldest first (score trend), plus the latest two completed reports (for the diff). */
export async function getProjectHistory(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      audits: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, status: true, overallScore: true, auditMode: true, crawlLimit: true, pagesCrawled: true, gscProperty: true, createdBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!project) return null;
  const completed = project.audits.filter((a) => a.status === 'completed' && a.overallScore !== null);
  const lastTwo = completed.slice(-2).map((a) => a.id);
  const reports = lastTwo.length
    ? await prisma.audit.findMany({ where: { id: { in: lastTwo } }, select: { id: true, report: true } })
    : [];
  const report = (auditId: string | undefined) => (reports.find((r) => r.id === auditId)?.report ?? undefined) as ReportModel | undefined;
  return {
    project: { id: project.id, domain: project.domain, name: project.name, createdAt: project.createdAt },
    audits: project.audits.map((a) => ({ ...a, createdBy: a.createdBy ? a.createdBy.name || a.createdBy.email : null })),
    latest: report(lastTwo[lastTwo.length - 1]),
    previous: lastTwo.length === 2 ? report(lastTwo[0]) : undefined,
  };
}

/** The project of an audit's domain (for links from a report to its project page). */
export async function projectIdForAudit(auditId: string): Promise<string | null> {
  return (await prisma.audit.findUnique({ where: { id: auditId }, select: { projectId: true } }))?.projectId ?? null;
}
