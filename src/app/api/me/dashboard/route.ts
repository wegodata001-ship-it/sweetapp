import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  filterWorkflowRunsForUser,
  logStrictScope,
  strictUserId,
} from "@/lib/auth/strict-user-isolation";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";
import { serializeWorkflowRunDetail } from "@/lib/workflows/serialize";

export const dynamic = "force-dynamic";

const activeRunInclude = {
  assignee: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  template: { select: { id: true, title: true, color: true } },
  items: true,
} satisfies Prisma.WorkflowRunInclude;

/**
 * GET /api/me/dashboard — פורטל עובד בלבד.
 * אין employeeId. רק userId = session.sub.
 */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const uid = strictUserId(session);

  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [activeSession, todaySessions, activeRunsRaw, dailyWorkTasksOpen] = await Promise.all([
      prismaAny.workSession.findFirst({
        where: { userId: uid, status: "ACTIVE" },
        orderBy: { clockIn: "desc" },
      }),
      prismaAny.workSession.findMany({
        where: {
          userId: uid,
          workDate: { gte: startOfDay, lt: tomorrow },
        },
        orderBy: { clockIn: "asc" },
      }),
      prisma.workflowRun.findMany({
        where: { assigneeId: uid, status: "IN_PROGRESS" },
        include: activeRunInclude,
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      prisma.employeeTask.count({
        where: {
          assignedToUserId: uid,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      }),
    ]);

    const activeRuns = filterWorkflowRunsForUser(activeRunsRaw, uid);

    const todayCompletedMinutes = todaySessions
      .filter((r: { status: string }) => r.status === "ENDED")
      .reduce(
        (acc: number, r: { totalMinutes: number | null }) => acc + (r.totalMinutes ?? 0),
        0,
      );

    let openTasksCount = 0;
    let lateTasksCount = 0;
    for (const run of activeRuns) {
      for (const it of run.items) {
        if (it.status === "PENDING" || it.status === "ACTIVE") openTasksCount += 1;
        if (it.isLate) lateTasksCount += 1;
      }
    }

    const primaryRun = activeRuns[0] ?? null;

    logStrictScope("[GET /api/me/dashboard]", session, {
      returnedRuns: activeRuns.length,
      returnedRunIds: activeRuns.map((r) => r.id),
      returnedAssignees: activeRuns.map((r) => ({
        id: r.assigneeId,
        name: r.assignee?.fullName,
      })),
    });

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
          daily_work_tasks: dailyWorkTasksOpen,
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
