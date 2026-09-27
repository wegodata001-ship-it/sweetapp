import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  filterEmployeeTasksForUser,
  logStrictScope,
  strictUserId,
} from "@/lib/auth/strict-user-isolation";
import { warnDuplicateEmployeeIds } from "@/lib/work-tasks/duplicate-employee-check";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

export const dynamic = "force-dynamic";

/**
 * GET /api/work/my-tasks
 * עובד — WHERE assignedToUserId = session.sub בלבד
 */
export async function GET() {
  const started = performance.now();
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const authStarted = performance.now();
  const session = await getSessionFromCookie();
  const authMs = performance.now() - authStarted;
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const uid = strictUserId(session);

  try {
    const enforceStarted = performance.now();
    await enforceMaxShiftLength({ userId: uid });
    const enforceMs = performance.now() - enforceStarted;
    void warnDuplicateEmployeeIds();
    const queryStarted = performance.now();
    const rowsRaw = await prisma.employeeTask.findMany({
      where: { assignedToUserId: uid },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      take: 500,
    });

    const queryMs = performance.now() - queryStarted;
    const rows = filterEmployeeTasksForUser(rowsRaw, uid);

    logStrictScope("[GET /api/work/my-tasks]", session, {
      returnedTasks: rows.length,
      returnedTaskIds: rows.map((t) => t.id),
      returnedAssignees: rows.map((t) => t.assignedToUserId),
    });

    const response = NextResponse.json({
      ok: true,
      data: rows.map(serializeWorkEmployeeTask),
    });
    response.headers.set(
      "Server-Timing",
      `auth;dur=${Math.round(authMs)}, enforce;dur=${Math.round(enforceMs)}, query;dur=${Math.round(queryMs)}, total;dur=${Math.round(performance.now() - started)}`,
    );
    return response;
  } catch (e) {
    console.error("[GET /api/work/my-tasks]", e);
    return NextResponse.json({ ok: false, error: "שגיאה בטעינת משימות" }, { status: 500 });
  }
}
