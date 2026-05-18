import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { resolveEmployeeTaskAssigneeIdsForUser } from "@/lib/tasks/task-access";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";
import { serializeWorkflowRunDetail } from "@/lib/workflows/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/dashboard
 *
 * Single roundtrip for the employee home page. Returns:
 *  - The current active work-session (or null) + today's worked minutes
 *  - The current active workflow run for the caller (the "active task")
 *  - Open / late task counts across all in-progress runs
 *  - Today's history sessions to render the "today entry / exit" tile
 */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const viewerAssigneeIds = await resolveEmployeeTaskAssigneeIdsForUser(session.sub);

    const [activeSession, todaySessions, activeRuns] = await Promise.all([
      prismaAny.workSession.findFirst({
        where: { userId: session.sub, status: "ACTIVE" },
        orderBy: { clockIn: "desc" },
      }),
      prismaAny.workSession.findMany({
        where: {
          userId: session.sub,
          workDate: { gte: startOfDay, lt: tomorrow },
        },
        orderBy: { clockIn: "asc" },
      }),
      prismaAny.workflowRun.findMany({
        where: { assigneeId: { in: viewerAssigneeIds }, status: "IN_PROGRESS" },
        include: {
          assignee: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          template: { select: { id: true, title: true, color: true } },
          items: { orderBy: { orderIndex: "asc" } },
        },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const todayCompletedMinutes = todaySessions
      .filter((r: { status: string }) => r.status === "ENDED")
      .reduce(
        (acc: number, r: { totalMinutes: number | null }) => acc + (r.totalMinutes ?? 0),
        0,
      );

    let openTasksCount = 0;
    let lateTasksCount = 0;
    type RunItem = { status: string; isLate: boolean };
    for (const run of activeRuns) {
      for (const it of run.items as RunItem[]) {
        if (it.status === "PENDING" || it.status === "ACTIVE") openTasksCount += 1;
        if (it.isLate) lateTasksCount += 1;
      }
    }

    const primaryRun = activeRuns[0] ?? null;

    return NextResponse.json({
      ok: true,
      data: {
        session: activeSession ? serializeWorkSession(activeSession) : null,
        today: {
          sessions: todaySessions.map(serializeWorkSession),
          completed_minutes: todayCompletedMinutes,
        },
        active_run: primaryRun ? serializeWorkflowRunDetail(primaryRun) : null,
        other_active_run_count: Math.max(0, activeRuns.length - 1),
        counts: {
          open_tasks: openTasksCount,
          late_tasks: lateTasksCount,
          active_runs: activeRuns.length,
        },
      },
    });
  } catch (e) {
    console.error("[GET /api/me/dashboard]", e);
    return NextResponse.json(
      { ok: false, error: "שגיאה בטעינת לוח הבית" },
      { status: 500 },
    );
  }
}
