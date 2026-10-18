import { Prisma } from "@prisma/client";
import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { prisma } from "@/lib/prisma";
import { serializeWorkEmployeeTask, type SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

/** Page size for infinite scroll. This is not a cap on how many tasks an employee can reach. */
export const MY_TASKS_PAGE_SIZE = 40;

/** @deprecated Use MY_TASKS_PAGE_SIZE. The screen no longer stops at 80 rows. */
export const MY_TASKS_SCREEN_LIMIT = MY_TASKS_PAGE_SIZE;

export type MyTasksShiftSummary = {
  clock_in: string;
};

export type MyTasksListPage = {
  tasks: SerializedWorkEmployeeTask[];
  total: number;
  next_cursor: string | null;
};

export type MyTasksSnapshot = {
  /** First open page followed by the first completed-today page. */
  tasks: SerializedWorkEmployeeTask[];
  open: MyTasksListPage;
  completed: MyTasksListPage;
  totals: { open: number; completed_today: number };
  stats: EmployeeTaskDayStats;
  shift: MyTasksShiftSummary | null;
  today: { completed_minutes: number };
  auto_closed: boolean;
  shift_open: boolean;
};

export type TaskPageCursor = {
  rank: number;
  orderIndex: number;
  createdAt: string;
  id: string;
};

export type TaskPageScope = "open" | "completed";

type SnapshotSqlRow = {
  shift: { id?: string; clockIn?: string; status?: string } | null;
  completed_minutes: number | bigint | null;
  open_total: number | bigint | null;
  completed_total: number | bigint | null;
  open_tasks: unknown;
  completed_tasks: unknown;
  stat_total: number | bigint | null;
  stat_completed: number | bigint | null;
  stat_pending: number | bigint | null;
  stat_in_progress: number | bigint | null;
  stat_avg_minutes: number | bigint | null;
};

type PageSqlRow = {
  total: number | bigint | null;
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
  rank?: number;
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

export function encodeTaskPageCursor(cursor: TaskPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTaskPageCursor(raw: string | null | undefined): TaskPageCursor | null {
  if (!raw?.trim()) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<TaskPageCursor>;
    const createdAt = String(json.createdAt ?? "");
    const created = new Date(createdAt);
    const id = String(json.id ?? "").trim();
    const rank = Number(json.rank);
    const orderIndex = Number(json.orderIndex);
    if (!id || !createdAt || Number.isNaN(created.getTime())) return null;
    if (!Number.isInteger(rank) || rank < 0 || rank > 3) return null;
    if (!Number.isInteger(orderIndex)) return null;
    return { rank, orderIndex, createdAt, id };
  } catch {
    return null;
  }
}

/** Append a page without repeating a task id already on screen. */
export function appendTaskPage<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((row) => row.id));
  const extra = incoming.filter((row) => !seen.has(row.id));
  return extra.length === 0 ? current : [...current, ...extra];
}

/**
 * Replace one task after the server confirms start or completion.
 * Every other id stays in place.
 */
export function replaceTaskById<T extends { id: string }>(tasks: T[], next: T): T[] {
  let found = false;
  const mapped = tasks.map((row) => {
    if (row.id !== next.id) return row;
    found = true;
    return { ...row, ...next };
  });
  return found ? mapped : [...mapped, next];
}

export function statsAfterStart(
  stats: EmployeeTaskDayStats,
  previousStatus: string,
): EmployeeTaskDayStats {
  if (previousStatus === "IN_PROGRESS") return stats;
  return {
    ...stats,
    pending: previousStatus === "PENDING" ? Math.max(0, stats.pending - 1) : stats.pending,
    inProgress: stats.inProgress + 1,
  };
}

export function statsAfterComplete(
  stats: EmployeeTaskDayStats,
  previousStatus: string,
): EmployeeTaskDayStats {
  if (previousStatus === "COMPLETED") return stats;
  const completed = stats.completed + 1;
  return {
    ...stats,
    completed,
    pending: previousStatus === "PENDING" ? Math.max(0, stats.pending - 1) : stats.pending,
    inProgress: previousStatus === "IN_PROGRESS" ? Math.max(0, stats.inProgress - 1) : stats.inProgress,
    progressPct: stats.total > 0 ? Math.round((completed / stats.total) * 100) : 0,
  };
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

const TASK_PICK = `
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
`;

function asJsonArray(value: unknown): RawTaskJson[] {
  if (Array.isArray(value)) return value as RawTaskJson[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as RawTaskJson[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toStats(row: {
  stat_total: number | bigint | null;
  stat_completed: number | bigint | null;
  stat_pending: number | bigint | null;
  stat_in_progress: number | bigint | null;
  stat_avg_minutes: number | bigint | null;
}): EmployeeTaskDayStats {
  const total = Number(row.stat_total ?? 0);
  const completed = Number(row.stat_completed ?? 0);
  const avg = row.stat_avg_minutes == null ? null : Number(row.stat_avg_minutes);
  return {
    total,
    completed,
    pending: Number(row.stat_pending ?? 0),
    inProgress: Number(row.stat_in_progress ?? 0),
    lateWhileActive: 0,
    progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    avgCompletedMinutes: avg == null || Number.isNaN(avg) ? null : avg,
  };
}

function pageFromRaw(raw: RawTaskJson[], total: number, userId: string): MyTasksListPage {
  const hasMore = raw.length > MY_TASKS_PAGE_SIZE;
  const slice = raw.slice(0, MY_TASKS_PAGE_SIZE);
  const tasks = slice
    .filter((t) => String(t.assignedToUserId ?? "").trim() === userId)
    .map(mapRawTask);
  const last = slice[slice.length - 1];
  const createdAt =
    last == null
      ? ""
      : last.createdAt instanceof Date
        ? last.createdAt.toISOString()
        : String(last.createdAt);
  const next_cursor =
    hasMore && last && createdAt
      ? encodeTaskPageCursor({
          rank: Number(last.rank ?? 3),
          orderIndex: Number(last.orderIndex) || 0,
          createdAt,
          id: last.id,
        })
      : null;
  return { tasks, total, next_cursor };
}

/**
 * Read-only first pages plus totals. Does not close a shift.
 * One SQL round-trip. Open and completed stay in separate pages.
 */
export async function queryMyTasksSnapshot(input: {
  userId: string;
  role: string;
}): Promise<Omit<MyTasksSnapshot, "auto_closed"> & { dbMs: number }> {
  const uid = input.userId.trim();
  const { start, end } = utcDayBounds();
  const take = MY_TASKS_PAGE_SIZE + 1;
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
    universe AS (
      SELECT
        t.status,
        t."startedAt",
        t."completedAt",
        CASE t.status
          WHEN 'IN_PROGRESS' THEN 0
          WHEN 'DELAYED' THEN 1
          WHEN 'PENDING' THEN 2
          ELSE 3
        END AS rank,
        t."orderIndex",
        t."createdAt",
        t.id,
        t."employeeId",
        t."sessionId",
        t."taskTemplateId",
        t.title,
        t.description,
        t."estimatedMinutes",
        t."delayReason",
        t."delayedAt",
        t."lateReason",
        t."activeWorkMs",
        t."segmentStartedAt",
        t."targetDueAt",
        t."assignedToUserId",
        CASE
          WHEN t.status IN ('PENDING', 'IN_PROGRESS', 'DELAYED') THEN 'open'
          ELSE 'completed'
        END AS scope
      FROM "EmployeeTask" t
      INNER JOIN "EmployeeWorkSession" s ON s.id = t."sessionId"
      WHERE t."assignedToUserId" = ${uid}
        AND (
          t.status IN ('PENDING', 'IN_PROGRESS', 'DELAYED')
          OR (
            t.status = 'COMPLETED'
            AND (s."workDate" >= ${start} OR t."completedAt" >= ${start})
          )
        )
    )
    SELECT
      (SELECT json_build_object('id', id, 'clockIn', "clockIn", 'status', status) FROM shift) AS shift,
      (SELECT completed_minutes FROM today_done) AS completed_minutes,
      (SELECT COUNT(*)::int FROM universe WHERE scope = 'open') AS open_total,
      (SELECT COUNT(*)::int FROM universe WHERE scope = 'completed') AS completed_total,
      COALESCE((
        SELECT json_agg(to_jsonb(p) ORDER BY p.rank, p."orderIndex", p."createdAt", p.id)
        FROM (
          SELECT * FROM universe WHERE scope = 'open'
          ORDER BY rank, "orderIndex", "createdAt", id
          LIMIT ${take}
        ) p
      ), '[]'::json) AS open_tasks,
      COALESCE((
        SELECT json_agg(to_jsonb(p) ORDER BY p.rank, p."orderIndex", p."createdAt", p.id)
        FROM (
          SELECT * FROM universe WHERE scope = 'completed'
          ORDER BY rank, "orderIndex", "createdAt", id
          LIMIT ${take}
        ) p
      ), '[]'::json) AS completed_tasks,
      (SELECT COUNT(*)::int FROM universe) AS stat_total,
      (SELECT COUNT(*)::int FROM universe WHERE status = 'COMPLETED') AS stat_completed,
      (SELECT COUNT(*)::int FROM universe WHERE status = 'PENDING') AS stat_pending,
      (SELECT COUNT(*)::int FROM universe WHERE status = 'IN_PROGRESS') AS stat_in_progress,
      (
        SELECT ROUND(AVG(
          CASE
            WHEN status = 'COMPLETED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL
            THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) / 60.0))
            ELSE NULL
          END
        ))
        FROM universe
      ) AS stat_avg_minutes
  `;
  const dbMs = performance.now() - queryStarted;
  const row = rows[0];
  const open = pageFromRaw(asJsonArray(row?.open_tasks), Number(row?.open_total ?? 0), uid);
  const completed = pageFromRaw(
    asJsonArray(row?.completed_tasks),
    Number(row?.completed_total ?? 0),
    uid,
  );
  const clockIn = row?.shift?.clockIn ? asDate(row.shift.clockIn) : null;
  const shift = clockIn ? { clock_in: clockIn.toISOString() } : null;
  return {
    tasks: [...open.tasks, ...completed.tasks],
    open,
    completed,
    totals: { open: open.total, completed_today: completed.total },
    stats: toStats(
      row ?? {
        stat_total: 0,
        stat_completed: 0,
        stat_pending: 0,
        stat_in_progress: 0,
        stat_avg_minutes: null,
      },
    ),
    shift,
    today: { completed_minutes: Number(row?.completed_minutes ?? 0) },
    shift_open: input.role !== "EMPLOYEE" || shift != null,
    dbMs,
  };
}

/** Next page of one scope. Still filtered to this user id only. */
export async function queryMyTasksPage(input: {
  userId: string;
  scope: TaskPageScope;
  cursor: TaskPageCursor | null;
}): Promise<MyTasksListPage & { dbMs: number }> {
  const uid = input.userId.trim();
  const { start, end } = utcDayBounds();
  const take = MY_TASKS_PAGE_SIZE + 1;
  const hasCursor = input.cursor != null;
  const cursor = input.cursor ?? {
    rank: 0,
    orderIndex: 0,
    createdAt: new Date(0).toISOString(),
    id: "",
  };
  const queryStarted = performance.now();
  const rows = await prisma.$queryRaw<PageSqlRow[]>`
    WITH base AS (
      SELECT
        ${Prisma.raw(TASK_PICK)},
        CASE t.status
          WHEN 'IN_PROGRESS' THEN 0
          WHEN 'DELAYED' THEN 1
          WHEN 'PENDING' THEN 2
          ELSE 3
        END AS rank
      FROM "EmployeeTask" t
      INNER JOIN "EmployeeWorkSession" s ON s.id = t."sessionId"
      WHERE t."assignedToUserId" = ${uid}
        AND (
          (${input.scope} = 'open' AND t.status IN ('PENDING', 'IN_PROGRESS', 'DELAYED'))
          OR (
            ${input.scope} = 'completed'
            AND t.status = 'COMPLETED'
            AND (s."workDate" >= ${start} OR t."completedAt" >= ${start})
          )
        )
    ),
    page AS (
      SELECT * FROM base
      WHERE ${hasCursor} = false
         OR (rank, "orderIndex", "createdAt", id) > (
           SELECT b.rank, b."orderIndex", b."createdAt", b.id
           FROM base b
           WHERE b.id = ${cursor.id}
         )
      ORDER BY rank ASC, "orderIndex" ASC, "createdAt" ASC, id ASC
      LIMIT ${take}
    )
    SELECT
      (SELECT COUNT(*)::int FROM base) AS total,
      COALESCE(
        (SELECT json_agg(to_jsonb(p) ORDER BY p.rank, p."orderIndex", p."createdAt", p.id) FROM page p),
        '[]'::json
      ) AS tasks
  `;
  const dbMs = performance.now() - queryStarted;
  const row = rows[0];
  const page = pageFromRaw(asJsonArray(row?.tasks), Number(row?.total ?? 0), uid);
  return { ...page, dbMs };
}

/**
 * Employee My Tasks screen. Enforces the 12-hour shift, then one read.
 * Open tasks and today's completed tasks are paged separately.
 */
export async function loadMyTasksSnapshot(input: {
  userId: string;
  role: string;
}): Promise<MyTasksSnapshot & { dbMs: number; enforceMs: number }> {
  const uid = input.userId.trim();
  const enforceStarted = performance.now();
  const closed = await enforceMaxShiftLength({ userId: uid });
  const enforceMs = performance.now() - enforceStarted;
  const snap = await queryMyTasksSnapshot({ userId: uid, role: input.role });
  return {
    ...snap,
    auto_closed: closed.some((row) => row.userId === uid),
    enforceMs,
  };
}
