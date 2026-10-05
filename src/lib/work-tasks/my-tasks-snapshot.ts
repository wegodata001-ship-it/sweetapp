import { prisma } from "@/lib/prisma";
import { serializeWorkEmployeeTask, type SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

export const MY_TASKS_SCREEN_LIMIT = 80;

export type MyTasksShiftSummary = {
  clock_in: string;
};

export type MyTasksSnapshot = {
  tasks: SerializedWorkEmployeeTask[];
  shift: MyTasksShiftSummary | null;
  today: { completed_minutes: number };
  auto_closed: boolean;
  shift_open: boolean;
};

type SnapshotSqlRow = {
  shift: { id?: string; clockIn?: string; status?: string } | null;
  completed_minutes: number | bigint | null;
  tasks: unknown;
};

type RawTaskJson = {
  id: string;
  employeeId: string;
  sessionId: string;
  taskTemplateId: string | null;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  status: string;
  delayReason: string | null;
  delayedAt: string | Date | null;
  lateReason: string | null;
  activeWorkMs: number | null;
  segmentStartedAt: string | Date | null;
  orderIndex: number;
  createdAt: string | Date;
  targetDueAt: string | Date | null;
  assignedToUserId: string | null;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapRawTask(row: RawTaskJson): SerializedWorkEmployeeTask {
  return serializeWorkEmployeeTask({
    id: row.id,
    employeeId: row.employeeId,
    sessionId: row.sessionId,
    taskTemplateId: row.taskTemplateId,
    title: row.title,
    description: row.description,
    estimatedMinutes: Number(row.estimatedMinutes) || 0,
    startedAt: asDate(row.startedAt),
    completedAt: asDate(row.completedAt),
    status: row.status,
    delayReason: row.delayReason,
    delayedAt: asDate(row.delayedAt),
    lateReason: row.lateReason,
    activeWorkMs: Number(row.activeWorkMs ?? 0),
    segmentStartedAt: asDate(row.segmentStartedAt),
    orderIndex: Number(row.orderIndex) || 0,
    createdAt: asDate(row.createdAt) ?? new Date(0),
    targetDueAt: asDate(row.targetDueAt),
  });
}

export function myTasksFingerprint(tasks: SerializedWorkEmployeeTask[]): string {
  return tasks
    .map(
      (t) =>
        `${t.id}:${t.status}:${t.started_at ?? ""}:${t.completed_at ?? ""}:${t.order_index}:${t.active_work_ms}:${t.segment_started_at ?? ""}:${t.delay_reason ?? ""}`,
    )
    .join("|");
}

export function utcDayBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * One SQL round-trip for the employee My Tasks screen.
 * Open tasks + today's completed only. No user/employee/history joins.
 */
export async function loadMyTasksSnapshot(input: {
  userId: string;
  role: string;
}): Promise<MyTasksSnapshot & { dbMs: number; enforceMs: number }> {
  const uid = input.userId;
  const enforceStarted = performance.now();
  const closed = await enforceMaxShiftLength({ userId: uid });
  const enforceMs = performance.now() - enforceStarted;
  const autoClosed = closed.some((row) => row.userId === uid);

  const { start, end } = utcDayBounds();
  const queryStarted = performance.now();
  const rows = await prisma.$queryRaw<SnapshotSqlRow[]>`
    WITH shift AS (
      SELECT id, "clockIn", status
      FROM "WorkSession"
      WHERE "userId" = ${uid} AND status = 'ACTIVE'
      ORDER BY "clockIn" DESC
      LIMIT 1
    ),
    today_done AS (
      SELECT COALESCE(SUM("totalMinutes"), 0)::int AS completed_minutes
      FROM "WorkSession"
      WHERE "userId" = ${uid}
        AND "workDate" >= ${start}
        AND "workDate" < ${end}
        AND status = 'ENDED'
    ),
    picked AS (
      SELECT
        t.id,
        t."employeeId",
        t."sessionId",
        t."taskTemplateId",
        t.title,
        t.description,
        t."estimatedMinutes",
        t."startedAt",
        t."completedAt",
        t.status,
        t."delayReason",
        t."delayedAt",
        t."lateReason",
        t."activeWorkMs",
        t."segmentStartedAt",
        t."orderIndex",
        t."createdAt",
        t."targetDueAt",
        t."assignedToUserId"
      FROM "EmployeeTask" t
      INNER JOIN "EmployeeWorkSession" s ON s.id = t."sessionId"
      WHERE t."assignedToUserId" = ${uid}
        AND (
          t.status IN ('PENDING', 'IN_PROGRESS', 'DELAYED')
          OR (
            t.status = 'COMPLETED'
            AND (
              s."workDate" >= ${start}
              OR t."completedAt" >= ${start}
            )
          )
        )
      ORDER BY
        CASE t.status
          WHEN 'IN_PROGRESS' THEN 0
          WHEN 'DELAYED' THEN 1
          WHEN 'PENDING' THEN 2
          ELSE 3
        END,
        t."orderIndex" ASC,
        t."createdAt" ASC
      LIMIT 80
    )
    SELECT
      (SELECT json_build_object('id', id, 'clockIn', "clockIn", 'status', status) FROM shift) AS shift,
      (SELECT completed_minutes FROM today_done) AS completed_minutes,
      COALESCE((SELECT json_agg(to_jsonb(p)) FROM picked p), '[]'::json) AS tasks
  `;
  const dbMs = performance.now() - queryStarted;

  const row = rows[0];
  const rawTasks = Array.isArray(row?.tasks) ? (row.tasks as RawTaskJson[]) : [];
  const tasks = rawTasks
    .filter((t) => String(t.assignedToUserId ?? "").trim() === uid)
    .map(mapRawTask);

  const clockIn = row?.shift?.clockIn ? asDate(row.shift.clockIn) : null;
  const shift = clockIn ? { clock_in: clockIn.toISOString() } : null;
  const shiftOpen = input.role !== "EMPLOYEE" || shift != null;

  return {
    tasks,
    shift,
    today: { completed_minutes: Number(row?.completed_minutes ?? 0) },
    auto_closed: autoClosed,
    shift_open: shiftOpen,
    dbMs,
    enforceMs,
  };
}
