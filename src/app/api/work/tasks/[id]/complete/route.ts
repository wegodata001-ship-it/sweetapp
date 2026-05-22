import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { computeActualMinutes, isTaskLate } from "@/lib/tasks/helpers";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { assertEmployeeOwnsWorkTask } from "@/lib/work-tasks/access";
import { logTaskCompleteDenied } from "@/lib/work-tasks/task-security-log";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { notifyTaskCompleted } from "@/lib/notifications/task-flow";
import { clearUserActiveTask } from "@/lib/work-status/active-task";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { delay_reason?: string | null };

  try {
    const task = await prisma.employeeTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: "משימה לא נמצאה" }, { status: 404 });
    }

    const gate = await assertEmployeeOwnsWorkTask(session, { ...task, id }, "complete");
    if (!gate.ok) {
      logTaskCompleteDenied({
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
      return NextResponse.json({
        ok: true,
        data: serializeWorkEmployeeTask(task),
        notificationSent: false,
      });
    }

    if (task.status !== "IN_PROGRESS" || !task.startedAt) {
      return NextResponse.json({ ok: false, error: "יש להתחיל את המשימה לפני הסיום" }, { status: 400 });
    }

    const completedAt = new Date();
    const actualMinutes = computeActualMinutes(task.startedAt, completedAt);
    const late = isTaskLate(task.estimatedMinutes, actualMinutes);
    const reason =
      typeof body.delay_reason === "string" ? body.delay_reason.trim().slice(0, 2000) : "";

    if (late && !reason) {
      return NextResponse.json(
        {
          ok: false,
          error: "המשימה חרגה מהזמן המשוער — נדרשת סיבת איחור",
          code: "NEED_DELAY_REASON",
        },
        { status: 400 },
      );
    }

    const previousStatus = task.status;
    const updated = await prisma.employeeTask.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt,
        isActive: false,
        delayReason: late ? reason || null : null,
      },
    });

    if (task.assignedToUserId) {
      await clearUserActiveTask(task.assignedToUserId);
    }

    console.log("[TASK STATUS UPDATED]", {
      taskId: id,
      from: previousStatus,
      to: "COMPLETED",
      employeeId: task.employeeId,
    });

    const notificationSent = await notifyTaskCompleted({
      taskId: id,
      employeeId: task.employeeId,
      taskTitle: task.title,
      previousStatus,
    });

    return NextResponse.json({
      ok: true,
      data: serializeWorkEmployeeTask(updated),
      notificationSent,
    });
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/complete]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן לסיים משימה" }, { status: 500 });
  }
}
