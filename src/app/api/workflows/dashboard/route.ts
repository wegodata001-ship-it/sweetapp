import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workflows/dashboard
 *
 * Manager dashboard for the workflow module:
 *
 *  - active_runs:        currently IN_PROGRESS
 *  - employees_late:     unique employees with at least one ACTIVE+late item
 *  - completed_today:    runs completed since 00:00 local
 *  - avg_actual_minutes: mean of actualMinutes across COMPLETED items today
 *  - completion_rate:    completed_items / (completed_items + pending_items) today
 *  - top_overdue_runs:   up to 5 runs with the most late items
 */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [activeRuns, completedToday, aggMinutes, completedItemsToday, pendingItemsToday, lateItems] =
      await Promise.all([
        prismaAny.workflowRun.findMany({
          where: { status: "IN_PROGRESS" },
          include: {
            assignee: { select: { id: true, fullName: true } },
            items: {
              select: {
                id: true,
                status: true,
                isLate: true,
                estimatedMinutes: true,
                startedAt: true,
              },
            },
          },
          orderBy: { startedAt: "asc" },
          take: 50,
        }),
        prismaAny.workflowRun.count({
          where: { status: "COMPLETED", completedAt: { gte: startOfDay } },
        }),
        prismaAny.workflowRunItem.aggregate({
          where: { status: "COMPLETED", completedAt: { gte: startOfDay } },
          _avg: { actualMinutes: true },
        }),
        prismaAny.workflowRunItem.count({
          where: { status: "COMPLETED", completedAt: { gte: startOfDay } },
        }),
        prismaAny.workflowRunItem.count({
          where: { status: { in: ["PENDING", "ACTIVE"] }, createdAt: { gte: startOfDay } },
        }),
        prismaAny.workflowRunItem.findMany({
          where: { isLate: true, completedAt: { gte: startOfDay } },
          select: { runId: true },
        }),
      ]);

    type RawRun = {
      id: string;
      title: string;
      assigneeId: string;
      currentIndex: number;
      startedAt: Date;
      assignee?: { fullName: string } | null;
      items: {
        id: string;
        status: string;
        isLate: boolean;
        estimatedMinutes: number;
        startedAt: Date | null;
      }[];
    };

    const employeesLate = new Set<string>();
    const topOverdueRuns: { id: string; title: string; assignee: string; late: number }[] = [];
    const nowMs = now.getTime();
    for (const r of activeRuns as RawRun[]) {
      let lateCount = 0;
      for (const it of r.items) {
        if (it.status === "ACTIVE" && it.startedAt) {
          const elapsedMin = (nowMs - new Date(it.startedAt).getTime()) / 60_000;
          if (it.estimatedMinutes > 0 && elapsedMin > it.estimatedMinutes) {
            lateCount += 1;
            employeesLate.add(r.assigneeId);
          }
        }
        if (it.isLate) lateCount += 1;
      }
      if (lateCount > 0) {
        topOverdueRuns.push({
          id: r.id,
          title: r.title,
          assignee: r.assignee?.fullName ?? "",
          late: lateCount,
        });
      }
    }
    topOverdueRuns.sort((a, b) => b.late - a.late);
    const lateRunIds = new Set<string>(
      (lateItems as { runId: string }[]).map((l) => l.runId),
    );

    const completedItems = Number(completedItemsToday) || 0;
    const pendingItems = Number(pendingItemsToday) || 0;
    const denominator = completedItems + pendingItems;
    const completionRate = denominator > 0 ? completedItems / denominator : 0;

    return NextResponse.json({
      ok: true,
      data: {
        active_runs: (activeRuns as RawRun[]).length,
        employees_late: employeesLate.size,
        completed_today: completedToday,
        runs_with_lates_today: lateRunIds.size,
        avg_actual_minutes:
          aggMinutes?._avg?.actualMinutes != null
            ? Math.round(Number(aggMinutes._avg.actualMinutes))
            : null,
        completion_rate: Math.round(completionRate * 100),
        top_overdue_runs: topOverdueRuns.slice(0, 5),
      },
    });
  } catch (e) {
    console.error("[GET /api/workflows/dashboard]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
