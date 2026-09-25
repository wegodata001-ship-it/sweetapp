import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { completeEmployeeTaskFast, readTaskActionSession } from "@/lib/work-tasks/fast-task-actions";
import { notifyTaskCompleted } from "@/lib/notifications/task-flow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const authStarted = performance.now();
  const session = await readTaskActionSession();
  const authMs = Math.round(performance.now() - authStarted);
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { late_reason?: string | null; delay_reason?: string | null };
  const lateReason = (body.late_reason ?? body.delay_reason ?? "").toString();

  try {
    const result = await completeEmployeeTaskFast(prisma, {
      taskId: id,
      userId: strictUserId(session),
      manager: canManageAllTasks(session),
      lateReason,
      sid: session.sid,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, success: false, error: result.error, code: result.code },
        { status: result.status },
      );
    }

    if (result.action === "COMPLETE") {
      const task = result.task;
      after(() => {
        void notifyTaskCompleted({
          taskId: task.id,
          employeeId: task.employeeId,
          taskTitle: task.title,
          previousStatus: "IN_PROGRESS",
        }).catch((error) => {
          console.error("[TASK COMPLETE NOTIFY]", error);
        });
      });
    }

    const completedTask = serializeWorkEmployeeTask(result.task);
    const nextTask = result.nextTask ? serializeWorkEmployeeTask(result.nextTask) : null;
    const response = NextResponse.json({
      ok: true,
      success: true,
      data: completedTask,
      completedTask,
      nextTask,
      notificationSent: result.action === "COMPLETE",
    });
    response.headers.set("Server-Timing", `auth;dur=${authMs}, db;dur=${result.dbMs}, notify;dur=0`);
    return response;
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/complete]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן לסיים משימה" }, { status: 500 });
  }
}
