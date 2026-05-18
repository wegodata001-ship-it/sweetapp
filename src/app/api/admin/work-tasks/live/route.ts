import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

export const dynamic = "force-dynamic";

/** ניטור מנהלים — משימות פעילות + ממתינות לאחרונה */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  try {
    const [active, pendingRecent] = await Promise.all([
      prisma.employeeTask.findMany({
        where: { status: "IN_PROGRESS" },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { startedAt: "desc" },
        take: 100,
      }),
      prisma.employeeTask.findMany({
        where: { status: "PENDING" },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const pack = (r: (typeof active)[number]) => ({
      ...serializeWorkEmployeeTask({
        id: r.id,
        employeeId: r.employeeId,
        sessionId: r.sessionId,
        taskTemplateId: r.taskTemplateId,
        title: r.title,
        description: r.description,
        estimatedMinutes: r.estimatedMinutes,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        status: r.status,
        delayReason: r.delayReason,
        orderIndex: r.orderIndex,
        createdAt: r.createdAt,
      }),
      employee_name: r.employee.name,
    });

    return NextResponse.json({
      ok: true,
      data: {
        active: active.map(pack),
        pending: pendingRecent.map(pack),
      },
    });
  } catch (e) {
    console.error("[GET /api/admin/work-tasks/live]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}
