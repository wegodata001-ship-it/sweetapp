import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { assertEmployeeOwnsWorkTask } from "@/lib/work-tasks/access";
import { logTaskStartDenied } from "@/lib/work-tasks/task-security-log";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const task = await prisma.employeeTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: "משימה לא נמצאה" }, { status: 404 });
    }

    const gate = await assertEmployeeOwnsWorkTask(session, { ...task, id }, "start");
    if (!gate.ok) {
      logTaskStartDenied({
        taskId: id,
        userId: strictUserId(session),
        assignedToUserId: task.assignedToUserId,
        code: gate.code,
      });
      return NextResponse.json(
        { ok: false, error: gate.error, code: gate.code },
        { status: gate.status },
      );
    }

    if (task.status === "COMPLETED") {
      return NextResponse.json({ ok: false, error: "משימה כבר הושלמה" }, { status: 400 });
    }

    if (task.status === "IN_PROGRESS" && task.startedAt) {
      return NextResponse.json({ ok: true, data: serializeWorkEmployeeTask(task) });
    }

    if (!canManageAllTasks(session)) {
      const other = await prisma.employeeTask.findFirst({
        where: {
          assignedToUserId: strictUserId(session),
          status: "IN_PROGRESS",
          id: { not: task.id },
        },
      });
      if (other) {
        return NextResponse.json(
          { ok: false, error: "כבר יש משימה פעילה — סיים אותה לפני שמתחילים אחרת" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.employeeTask.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: serializeWorkEmployeeTask(updated) });
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/start]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן להתחיל משימה" }, { status: 500 });
  }
}
