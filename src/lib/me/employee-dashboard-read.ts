import { prisma } from "@/lib/prisma";
import { filterWorkflowRunsForUser } from "@/lib/auth/strict-user-isolation";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";
import { serializeWorkflowRunDetail } from "@/lib/workflows/serialize";
import { utcDayBounds } from "@/lib/work-tasks/my-tasks-snapshot";

type SessionJson = {
  id: string;
  userId: string;
  workDate: string | Date;
  clockIn: string | Date;
  clockOut: string | Date | null;
  totalMinutes: number | null;
  status: "ACTIVE" | "ENDED" | "CANCELLED";
  checkoutType: "MANUAL" | "AUTO_12_HOURS" | null;
  note: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type RunItemJson = {
  id: string;
  runId: string;
  sourceTaskId: string | null;
  title: string;
  description: string | null;
  color: string | null;
  estimatedMinutes: number;
  requireLateReason: boolean;
  orderIndex: number;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "SKIPPED";
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  actualMinutes: number | null;
  isLate: boolean;
  lateReason: string | null;
};

type RunJson = {
  id: string;
  templateId: string | null;
  assigneeId: string;
  title: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  startedAt: string | Date;
  completedAt: string | Date | null;
  abortedAt: string | Date | null;
  currentIndex: number;
  notes: string | null;
  assignee: { id: string; fullName: string } | null;
  template: { id: string; title: string; color: string | null } | null;
  items: RunItemJson[] | null;
};

type DashboardSqlRow = {
  active_session: SessionJson | null;
  today_sessions: SessionJson[] | null;
  active_runs: RunJson[] | null;
  daily_work_tasks: number | bigint | null;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sessionRow(raw: SessionJson) {
  const workDate = asDate(raw.workDate);
  const clockIn = asDate(raw.clockIn);
  const createdAt = asDate(raw.createdAt);
  const updatedAt = asDate(raw.updatedAt);
  if (!workDate || !clockIn || !createdAt || !updatedAt) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    workDate,
    clockIn,
    clockOut: asDate(raw.clockOut),
    totalMinutes: raw.totalMinutes == null ? null : Number(raw.totalMinutes),
    status: raw.status,
    checkoutType: raw.checkoutType ?? null,
    note: raw.note ?? null,
    createdAt,
    updatedAt,
  };
}

/**
 * One round-trip for the employee home payload.
 * Same rows as the previous four Prisma calls: active shift, today's sessions,
 * up to 20 in-progress workflow runs, and the open employee-task count.
 * Does not close shifts and does not check permissions — the route still does both.
 */
export async function queryEmployeeDashboard(userId: string) {
  const uid = userId.trim();
  const { start, end } = utcDayBounds();
  const queryStarted = performance.now();
  const rows = await prisma.$queryRaw<DashboardSqlRow[]>`
    WITH active_session AS (
      SELECT
        id, "userId", "workDate", "clockIn", "clockOut", "totalMinutes",
        status, "checkoutType", note, "createdAt", "updatedAt"
      FROM "WorkSession"
      WHERE "userId" = ${uid} AND status = 'ACTIVE'
      ORDER BY "clockIn" DESC
      LIMIT 1
    ),
    today_sessions AS (
      SELECT
        id, "userId", "workDate", "clockIn", "clockOut", "totalMinutes",
        status, "checkoutType", note, "createdAt", "updatedAt"
      FROM "WorkSession"
      WHERE "userId" = ${uid}
        AND "workDate" >= ${start}
        AND "workDate" < ${end}
      ORDER BY "clockIn" ASC
    ),
    active_runs AS (
      SELECT *
      FROM "WorkflowRun"
      WHERE "assigneeId" = ${uid} AND status = 'IN_PROGRESS'
      ORDER BY "startedAt" DESC
      LIMIT 20
    )
    SELECT
      (SELECT to_jsonb(a) FROM active_session a) AS active_session,
      COALESCE(
        (SELECT json_agg(to_jsonb(t) ORDER BY t."clockIn" ASC) FROM today_sessions t),
        '[]'::json
      ) AS today_sessions,
      COALESCE(
        (
          SELECT json_agg(
            jsonb_build_object(
              'id', r.id,
              'templateId', r."templateId",
              'assigneeId', r."assigneeId",
              'title', r.title,
              'status', r.status,
              'startedAt', r."startedAt",
              'completedAt', r."completedAt",
              'abortedAt', r."abortedAt",
              'currentIndex', r."currentIndex",
              'notes', r.notes,
              'assignee', jsonb_build_object('id', u.id, 'fullName', u."fullName"),
              'template', CASE
                WHEN tpl.id IS NULL THEN NULL
                ELSE jsonb_build_object('id', tpl.id, 'title', tpl.title, 'color', tpl.color)
              END,
              'items', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', i.id,
                      'runId', i."runId",
                      'sourceTaskId', i."sourceTaskId",
                      'title', i.title,
                      'description', i.description,
                      'color', i.color,
                      'estimatedMinutes', i."estimatedMinutes",
                      'requireLateReason', i."requireLateReason",
                      'orderIndex', i."orderIndex",
                      'status', i.status,
                      'startedAt', i."startedAt",
                      'completedAt', i."completedAt",
                      'actualMinutes', i."actualMinutes",
                      'isLate', i."isLate",
                      'lateReason', i."lateReason"
                    )
                    ORDER BY i."orderIndex" ASC
                  )
                  FROM "WorkflowRunItem" i
                  WHERE i."runId" = r.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY r."startedAt" DESC
          )
          FROM active_runs r
          JOIN "User" u ON u.id = r."assigneeId"
          LEFT JOIN "WorkflowTemplate" tpl ON tpl.id = r."templateId"
        ),
        '[]'::json
      ) AS active_runs,
      (
        SELECT COUNT(*)::int
        FROM "EmployeeTask"
        WHERE "assignedToUserId" = ${uid}
          AND status IN ('PENDING', 'IN_PROGRESS')
      ) AS daily_work_tasks
  `;
  const dbMs = performance.now() - queryStarted;
  const row = rows[0];

  const active = row?.active_session ? sessionRow(row.active_session) : null;
  const today = asArray<SessionJson>(row?.today_sessions)
    .map(sessionRow)
    .filter((s): s is NonNullable<typeof s> => s != null);
  const runs = filterWorkflowRunsForUser(asArray<RunJson>(row?.active_runs), uid).map((run) => ({
    id: run.id,
    templateId: run.templateId,
    assigneeId: run.assigneeId,
    assignee: run.assignee,
    template: run.template,
    title: run.title,
    status: run.status,
    startedAt: asDate(run.startedAt) ?? new Date(0),
    completedAt: asDate(run.completedAt),
    abortedAt: asDate(run.abortedAt),
    currentIndex: Number(run.currentIndex) || 0,
    notes: run.notes,
    items: asArray<RunItemJson>(run.items).map((item) => ({
      ...item,
      estimatedMinutes: Number(item.estimatedMinutes) || 0,
      orderIndex: Number(item.orderIndex) || 0,
      actualMinutes: item.actualMinutes == null ? null : Number(item.actualMinutes),
      requireLateReason: Boolean(item.requireLateReason),
      isLate: Boolean(item.isLate),
      startedAt: asDate(item.startedAt),
      completedAt: asDate(item.completedAt),
    })),
  }));

  const todayCompletedMinutes = today
    .filter((s) => s.status === "ENDED")
    .reduce((acc, s) => acc + (s.totalMinutes ?? 0), 0);

  let openTasksCount = 0;
  let lateTasksCount = 0;
  for (const run of runs) {
    for (const item of run.items) {
      if (item.status === "PENDING" || item.status === "ACTIVE") openTasksCount += 1;
      if (item.isLate) lateTasksCount += 1;
    }
  }

  const primaryRun = runs[0] ?? null;

  return {
    dbMs,
    dbQueries: 1,
    data: {
      session: active ? serializeWorkSession(active) : null,
      today: {
        sessions: today.map(serializeWorkSession),
        completed_minutes: todayCompletedMinutes,
      },
      active_run: primaryRun ? serializeWorkflowRunDetail(primaryRun) : null,
      other_active_run_count: Math.max(0, runs.length - 1),
      counts: {
        open_tasks: openTasksCount,
        late_tasks: lateTasksCount,
        active_runs: runs.length,
        daily_work_tasks: Number(row?.daily_work_tasks ?? 0),
      },
    },
  };
}
