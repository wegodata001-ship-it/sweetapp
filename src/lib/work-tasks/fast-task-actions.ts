import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";

type SqlClient = Pick<typeof prisma, "$queryRaw">;

export async function readTaskActionSession(): Promise<SessionJwtPayload | null> {
  const { cookies } = await import("next/headers");
  const { COOKIE_NAME, verifySessionToken } = await import("@/lib/auth/jwt");
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session?.sid) return null;
  return session;
}

export type FastTaskRow = {
  id: string;
  employeeId: string;
  sessionId: string;
  taskTemplateId: string | null;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  delayReason: string | null;
  delayedAt: Date | null;
  lateReason: string | null;
  activeWorkMs: number;
  segmentStartedAt: Date | null;
  orderIndex: number;
  createdAt: Date;
  targetDueAt: Date | null;
  assignedToUserId: string | null;
};

export type FastTaskFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type FastTaskSuccess = {
  ok: true;
  action: "START" | "COMPLETE" | "DELAY" | "ALREADY";
  task: FastTaskRow;
  nextTask: FastTaskRow | null;
  dbMs: number;
};

const TASK_COLUMNS = `
  id, "employeeId", "sessionId", "taskTemplateId", title, description,
  "estimatedMinutes", "startedAt", "completedAt", status, "delayReason",
  "delayedAt", "lateReason", "activeWorkMs", "segmentStartedAt", "orderIndex",
  "createdAt", "targetDueAt", "assignedToUserId"
`;

type RawTask = FastTaskRow & { action: string };

function mapTask(row: RawTask | null | undefined): FastTaskRow | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    employeeId: row.employeeId,
    sessionId: row.sessionId,
    taskTemplateId: row.taskTemplateId,
    title: row.title,
    description: row.description,
    estimatedMinutes: Number(row.estimatedMinutes),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    delayReason: row.delayReason,
    delayedAt: row.delayedAt,
    lateReason: row.lateReason,
    activeWorkMs: Number(row.activeWorkMs ?? 0),
    segmentStartedAt: row.segmentStartedAt,
    orderIndex: Number(row.orderIndex),
    createdAt: row.createdAt,
    targetDueAt: row.targetDueAt,
    assignedToUserId: row.assignedToUserId,
  };
}

function fail(action: string): FastTaskFailure | null {
  switch (action) {
    case "NOT_FOUND":
      return { ok: false, status: 404, code: "NOT_FOUND", error: "משימה לא נמצאה" };
    case "NOT_YOURS":
      return {
        ok: false,
        status: 403,
        code: "NOT_YOUR_TASK",
        error: "לא ניתן לבצע פעולה על משימה שלא שייכת לך",
      };
    case "ALREADY_DONE":
      return { ok: false, status: 400, code: "ALREADY_DONE", error: "משימה כבר הושלמה" };
    case "OTHER_ACTIVE":
      return {
        ok: false,
        status: 400,
        code: "OTHER_ACTIVE",
        error: "יש לסיים או לעכב את המשימה הפעילה לפני מעבר למשימה זו.",
      };
    case "SEQUENCE":
      return { ok: false, status: 400, code: "SEQUENCE_LOCKED", error: "יש להשלים משימות קודמות קודם" };
    case "NOT_STARTED":
      return { ok: false, status: 400, code: "NOT_STARTED", error: "יש להתחיל את המשימה לפני הסיום" };
    case "NOT_ACTIVE":
      return { ok: false, status: 400, code: "NOT_ACTIVE", error: "אפשר לעכב רק משימה פעילה" };
    case "UNAUTH":
      return { ok: false, status: 401, code: "UNAUTH", error: "נדרשת התחברות" };
    case "NEED_REASON":
      return {
        ok: false,
        status: 400,
        code: "NEED_DELAY_REASON",
        error: "המשימה חרגה מהזמן המשוער — נדרשת סיבת איחור",
      };
    default:
      return null;
  }
}

const OUTPUT_COLUMNS = [
  "id",
  "employeeId",
  "sessionId",
  "taskTemplateId",
  "title",
  "description",
  "estimatedMinutes",
  "startedAt",
  "completedAt",
  "status",
  "delayReason",
  "delayedAt",
  "lateReason",
  "activeWorkMs",
  "segmentStartedAt",
  "orderIndex",
  "createdAt",
  "targetDueAt",
  "assignedToUserId",
] as const;

function quoted(column: string): string {
  return /[A-Z]/.test(column) ? `"${column}"` : column;
}

function pickedColumns(alias: string): string {
  return OUTPUT_COLUMNS.map((column) => {
    const q = quoted(column);
    return `CASE WHEN ${alias}.id IS NOT NULL THEN ${alias}.${q} ELSE f.${q} END AS ${q}`;
  }).join(",\n      ");
}

export async function startEmployeeTaskFast(
  db: SqlClient,
  input: { taskId: string; userId: string; manager: boolean; sid: string },
): Promise<FastTaskSuccess | FastTaskFailure> {
  const started = performance.now();
  const rows = await db.$queryRaw<RawTask[]>`
    WITH target AS (
      SELECT ${Prisma.raw(TASK_COLUMNS)}, "taskGroupId"
      FROM "EmployeeTask"
      WHERE id = ${input.taskId}
      FOR UPDATE
    ),
    lock_user AS (
      SELECT pg_advisory_xact_lock(hashtextextended(COALESCE(t."assignedToUserId", ${input.userId}), 0)) AS locked
      FROM target t
    ),
    flags AS (
      SELECT t.*,
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM "User" u
            WHERE u.id = ${input.userId}
              AND u."isActive" = true
              AND (
                u."currentSessionId" = ${input.sid}
                OR strpos(COALESCE(u."currentSessionId", ''), '"' || ${input.sid} || '"') > 0
              )
          ) THEN 'UNAUTH'
          WHEN ${input.manager} = false AND t."assignedToUserId" IS DISTINCT FROM ${input.userId} THEN 'NOT_YOURS'
          WHEN t.status = 'COMPLETED' THEN 'ALREADY_DONE'
          WHEN t.status = 'IN_PROGRESS' AND t."startedAt" IS NOT NULL THEN 'ALREADY'
          WHEN ${input.manager} = false AND EXISTS (
            SELECT 1 FROM "EmployeeTask" o
            WHERE o."assignedToUserId" = ${input.userId}
              AND o.status = 'IN_PROGRESS'
              AND o.id <> t.id
          ) THEN 'OTHER_ACTIVE'
          WHEN ${input.manager} = false AND t.status <> 'DELAYED' AND EXISTS (
            SELECT 1 FROM "EmployeeTask" p
            WHERE p."employeeId" = t."employeeId"
              AND p.id <> t.id
              AND p.status NOT IN ('COMPLETED', 'DELAYED')
              AND p."orderIndex" < t."orderIndex"
              AND (
                (t."taskGroupId" IS NOT NULL AND p."taskGroupId" = t."taskGroupId")
                OR (t."taskGroupId" IS NULL AND p."taskGroupId" IS NULL AND p."sessionId" = t."sessionId")
              )
          ) THEN 'SEQUENCE'
          ELSE 'START'
        END AS action
      FROM target t
      CROSS JOIN lock_user
    ),
    started AS (
      UPDATE "EmployeeTask" e
      SET status = 'IN_PROGRESS',
          "startedAt" = COALESCE(e."startedAt", NOW()),
          "segmentStartedAt" = NOW(),
          "isActive" = true
      FROM flags f
      WHERE e.id = f.id AND f.action = 'START'
      RETURNING ${Prisma.raw(TASK_COLUMNS.split(",").map((c) => `e.${c.trim()}`).join(", "))}
    ),
    touch AS (
      UPDATE "User" u
      SET "activeTaskId" = s.id,
          "activeTaskStartedAt" = s."startedAt",
          "lastSeenAt" = NOW()
      FROM started s
      WHERE u.id = COALESCE(s."assignedToUserId", ${input.userId})
      RETURNING u.id
    )
    SELECT
      f.action,
      ${Prisma.raw(pickedColumns("s"))}
    FROM flags f
    LEFT JOIN started s ON true
    LEFT JOIN touch ON true
  `;
  return finish(rows[0], started, null);
}

export async function completeEmployeeTaskFast(
  db: SqlClient,
  input: { taskId: string; userId: string; manager: boolean; lateReason: string; sid: string },
): Promise<FastTaskSuccess | FastTaskFailure> {
  const started = performance.now();
  const reason = input.lateReason.trim();
  const rows = await db.$queryRaw<Array<RawTask & NextBits>>`
    WITH target AS (
      SELECT ${Prisma.raw(TASK_COLUMNS)}, "taskGroupId"
      FROM "EmployeeTask"
      WHERE id = ${input.taskId}
      FOR UPDATE
    ),
    lock_user AS (
      SELECT pg_advisory_xact_lock(hashtextextended(COALESCE(t."assignedToUserId", ${input.userId}), 0)) AS locked
      FROM target t
    ),
    flags AS (
      SELECT t.*,
        (
          GREATEST(0, t."activeWorkMs")
          + CASE
              WHEN t.status = 'IN_PROGRESS' AND t."segmentStartedAt" IS NOT NULL
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - t."segmentStartedAt")) * 1000))::int
              ELSE 0
            END
        ) AS worked_ms,
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM "User" u
            WHERE u.id = ${input.userId}
              AND u."isActive" = true
              AND (
                u."currentSessionId" = ${input.sid}
                OR strpos(COALESCE(u."currentSessionId", ''), '"' || ${input.sid} || '"') > 0
              )
          ) THEN 'UNAUTH'
          WHEN ${input.manager} = false AND t."assignedToUserId" IS DISTINCT FROM ${input.userId} THEN 'NOT_YOURS'
          WHEN t.status = 'COMPLETED' THEN 'ALREADY'
          WHEN t.status <> 'IN_PROGRESS' OR t."startedAt" IS NULL THEN 'NOT_STARTED'
          WHEN t."estimatedMinutes" > 0
            AND (
              GREATEST(0, t."activeWorkMs")
              + CASE
                  WHEN t."segmentStartedAt" IS NOT NULL
                  THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - t."segmentStartedAt")) * 1000))::int
                  ELSE 0
                END
            ) > t."estimatedMinutes" * 60000
            AND ${reason} NOT IN ('MISSING_MATERIALS', 'MACHINE_BUSY', 'NO_AVAILABLE_SPACE')
            THEN 'NEED_REASON'
          ELSE 'COMPLETE'
        END AS action
      FROM target t
      CROSS JOIN lock_user
    ),
    done AS (
      UPDATE "EmployeeTask" e
      SET status = 'COMPLETED',
          "completedAt" = NOW(),
          "isActive" = false,
          "activeWorkMs" = f.worked_ms,
          "segmentStartedAt" = NULL,
          "lateReason" = CASE
            WHEN f."estimatedMinutes" > 0 AND f.worked_ms > f."estimatedMinutes" * 60000 THEN ${reason}
            ELSE NULL
          END
      FROM flags f
      WHERE e.id = f.id AND f.action = 'COMPLETE'
      RETURNING ${Prisma.raw(TASK_COLUMNS.split(",").map((c) => `e.${c.trim()}`).join(", "))}
    ),
    touch AS (
      UPDATE "User" u
      SET "activeTaskId" = NULL,
          "activeTaskStartedAt" = NULL,
          "lastSeenAt" = NOW()
      FROM flags f
      WHERE f.action = 'COMPLETE'
        AND u.id = COALESCE(f."assignedToUserId", ${input.userId})
        AND u."activeTaskId" = f.id
      RETURNING u.id
    ),
    nxt AS (
      SELECT n.*
      FROM flags f
      JOIN "EmployeeTask" n
        ON n."assignedToUserId" = COALESCE(f."assignedToUserId", ${input.userId})
       AND n.status = 'PENDING'
       AND n.id <> f.id
       AND NOT EXISTS (
         SELECT 1 FROM "EmployeeTask" p
         WHERE p."employeeId" = n."employeeId"
           AND p.id <> n.id
           AND p.id <> f.id
           AND p.status NOT IN ('COMPLETED', 'DELAYED')
           AND p."orderIndex" < n."orderIndex"
           AND (
             (n."taskGroupId" IS NOT NULL AND p."taskGroupId" = n."taskGroupId")
             OR (n."taskGroupId" IS NULL AND p."taskGroupId" IS NULL AND p."sessionId" = n."sessionId")
           )
       )
      WHERE f.action IN ('COMPLETE', 'ALREADY')
      ORDER BY n."orderIndex" ASC
      LIMIT 1
    )
    SELECT
      f.action,
      ${Prisma.raw(pickedColumns("d"))},
      nxt.id AS "nextId",
      nxt."employeeId" AS "nextEmployeeId",
      nxt."sessionId" AS "nextSessionId",
      nxt."taskTemplateId" AS "nextTaskTemplateId",
      nxt.title AS "nextTitle",
      nxt.description AS "nextDescription",
      nxt."estimatedMinutes" AS "nextEstimatedMinutes",
      nxt."startedAt" AS "nextStartedAt",
      nxt."completedAt" AS "nextCompletedAt",
      nxt.status AS "nextStatus",
      nxt."delayReason" AS "nextDelayReason",
      nxt."delayedAt" AS "nextDelayedAt",
      nxt."lateReason" AS "nextLateReason",
      nxt."activeWorkMs" AS "nextActiveWorkMs",
      nxt."segmentStartedAt" AS "nextSegmentStartedAt",
      nxt."orderIndex" AS "nextOrderIndex",
      nxt."createdAt" AS "nextCreatedAt",
      nxt."targetDueAt" AS "nextTargetDueAt",
      nxt."assignedToUserId" AS "nextAssignedToUserId"
    FROM flags f
    LEFT JOIN done d ON true
    LEFT JOIN touch ON true
    LEFT JOIN nxt ON true
  `;
  const row = rows[0];
  return finish(row, started, nextFrom(row));
}

type NextBits = {
  nextId: string | null;
  nextEmployeeId: string | null;
  nextSessionId: string | null;
  nextTaskTemplateId: string | null;
  nextTitle: string | null;
  nextDescription: string | null;
  nextEstimatedMinutes: number | null;
  nextStartedAt: Date | null;
  nextCompletedAt: Date | null;
  nextStatus: string | null;
  nextDelayReason: string | null;
  nextDelayedAt: Date | null;
  nextLateReason: string | null;
  nextActiveWorkMs: number | null;
  nextSegmentStartedAt: Date | null;
  nextOrderIndex: number | null;
  nextCreatedAt: Date | null;
  nextTargetDueAt: Date | null;
  nextAssignedToUserId: string | null;
};

function nextFrom(row: (RawTask & NextBits) | undefined): FastTaskRow | null {
  if (!row?.nextId || !row.nextEmployeeId || !row.nextSessionId || !row.nextTitle || !row.nextStatus || !row.nextCreatedAt) {
    return null;
  }
  return {
    id: row.nextId,
    employeeId: row.nextEmployeeId,
    sessionId: row.nextSessionId,
    taskTemplateId: row.nextTaskTemplateId,
    title: row.nextTitle,
    description: row.nextDescription,
    estimatedMinutes: Number(row.nextEstimatedMinutes ?? 0),
    startedAt: row.nextStartedAt,
    completedAt: row.nextCompletedAt,
    status: row.nextStatus,
    delayReason: row.nextDelayReason,
    delayedAt: row.nextDelayedAt,
    lateReason: row.nextLateReason,
    activeWorkMs: Number(row.nextActiveWorkMs ?? 0),
    segmentStartedAt: row.nextSegmentStartedAt,
    orderIndex: Number(row.nextOrderIndex ?? 0),
    createdAt: row.nextCreatedAt,
    targetDueAt: row.nextTargetDueAt,
    assignedToUserId: row.nextAssignedToUserId,
  };
}

export async function delayEmployeeTaskFast(
  db: SqlClient,
  input: { taskId: string; userId: string; manager: boolean; reason: string; sid: string },
): Promise<FastTaskSuccess | FastTaskFailure> {
  const started = performance.now();
  const reason = input.reason.trim();
  const rows = await db.$queryRaw<Array<RawTask & NextBits>>`
    WITH target AS (
      SELECT ${Prisma.raw(TASK_COLUMNS)}
      FROM "EmployeeTask"
      WHERE id = ${input.taskId}
      FOR UPDATE
    ),
    lock_user AS (
      SELECT pg_advisory_xact_lock(hashtextextended(COALESCE(t."assignedToUserId", ${input.userId}), 0)) AS locked
      FROM target t
    ),
    flags AS (
      SELECT t.*,
        (
          GREATEST(0, t."activeWorkMs")
          + CASE
              WHEN t.status = 'IN_PROGRESS' AND t."segmentStartedAt" IS NOT NULL
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - t."segmentStartedAt")) * 1000))::int
              ELSE 0
            END
        ) AS worked_ms,
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM "User" u
            WHERE u.id = ${input.userId}
              AND u."isActive" = true
              AND (
                u."currentSessionId" = ${input.sid}
                OR strpos(COALESCE(u."currentSessionId", ''), '"' || ${input.sid} || '"') > 0
              )
          ) THEN 'UNAUTH'
          WHEN ${input.manager} = false AND t."assignedToUserId" IS DISTINCT FROM ${input.userId} THEN 'NOT_YOURS'
          WHEN t.status = 'DELAYED' THEN 'ALREADY'
          WHEN t.status <> 'IN_PROGRESS' THEN 'NOT_ACTIVE'
          ELSE 'DELAY'
        END AS action
      FROM target t
      CROSS JOIN lock_user
    ),
    held AS (
      UPDATE "EmployeeTask" e
      SET status = 'DELAYED',
          "delayReason" = ${reason},
          "delayedAt" = NOW(),
          "activeWorkMs" = f.worked_ms,
          "segmentStartedAt" = NULL,
          "isActive" = false
      FROM flags f
      WHERE e.id = f.id AND f.action = 'DELAY'
      RETURNING ${Prisma.raw(TASK_COLUMNS.split(",").map((c) => `e.${c.trim()}`).join(", "))}
    ),
    touch AS (
      UPDATE "User" u
      SET "activeTaskId" = NULL,
          "activeTaskStartedAt" = NULL,
          "lastSeenAt" = NOW()
      FROM flags f
      WHERE f.action = 'DELAY'
        AND u.id = COALESCE(f."assignedToUserId", ${input.userId})
        AND u."activeTaskId" = f.id
      RETURNING u.id
    ),
    nxt AS (
      SELECT n.*
      FROM flags f
      JOIN "EmployeeTask" n
        ON n."assignedToUserId" = COALESCE(f."assignedToUserId", ${input.userId})
       AND n.status = 'PENDING'
       AND n.id <> f.id
       AND NOT EXISTS (
         SELECT 1 FROM "EmployeeTask" p
         WHERE p."employeeId" = n."employeeId"
           AND p.id <> n.id
           AND p.id <> f.id
           AND p.status NOT IN ('COMPLETED', 'DELAYED')
           AND p."orderIndex" < n."orderIndex"
           AND (
             (n."taskGroupId" IS NOT NULL AND p."taskGroupId" = n."taskGroupId")
             OR (n."taskGroupId" IS NULL AND p."taskGroupId" IS NULL AND p."sessionId" = n."sessionId")
           )
       )
      WHERE f.action IN ('DELAY', 'ALREADY')
      ORDER BY n."orderIndex" ASC
      LIMIT 1
    )
    SELECT
      f.action,
      ${Prisma.raw(pickedColumns("h"))},
      nxt.id AS "nextId",
      nxt."employeeId" AS "nextEmployeeId",
      nxt."sessionId" AS "nextSessionId",
      nxt."taskTemplateId" AS "nextTaskTemplateId",
      nxt.title AS "nextTitle",
      nxt.description AS "nextDescription",
      nxt."estimatedMinutes" AS "nextEstimatedMinutes",
      nxt."startedAt" AS "nextStartedAt",
      nxt."completedAt" AS "nextCompletedAt",
      nxt.status AS "nextStatus",
      nxt."delayReason" AS "nextDelayReason",
      nxt."delayedAt" AS "nextDelayedAt",
      nxt."lateReason" AS "nextLateReason",
      nxt."activeWorkMs" AS "nextActiveWorkMs",
      nxt."segmentStartedAt" AS "nextSegmentStartedAt",
      nxt."orderIndex" AS "nextOrderIndex",
      nxt."createdAt" AS "nextCreatedAt",
      nxt."targetDueAt" AS "nextTargetDueAt",
      nxt."assignedToUserId" AS "nextAssignedToUserId"
    FROM flags f
    LEFT JOIN held h ON true
    LEFT JOIN touch ON true
    LEFT JOIN nxt ON true
  `;
  const row = rows[0];
  return finish(row, started, nextFrom(row));
}

function finish(
  row: RawTask | undefined,
  started: number,
  nextTask: FastTaskRow | null,
): FastTaskSuccess | FastTaskFailure {
  if (!row) return { ok: false, status: 404, code: "NOT_FOUND", error: "משימה לא נמצאה" };
  const failed = fail(row.action);
  if (failed) return failed;
  const task = mapTask(row);
  if (!task) return { ok: false, status: 404, code: "NOT_FOUND", error: "משימה לא נמצאה" };
  const action = row.action === "ALREADY" ? "ALREADY" : (row.action as FastTaskSuccess["action"]);
  return {
    ok: true,
    action,
    task,
    nextTask,
    dbMs: Math.round(performance.now() - started),
  };
}
