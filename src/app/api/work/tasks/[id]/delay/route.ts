import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { delayEmployeeTaskFast, readTaskActionSession } from "@/lib/work-tasks/fast-task-actions";
import { isTaskBlockReason } from "@/lib/work-tasks/task-timing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const authStarted = performance.now();
  const session = await readTaskActionSession();
  const authMs = Math.round(performance.now() - authStarted);
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string; delayReason?: string };
  const reason = body.reason ?? body.delayReason ?? "";
  if (!isTaskBlockReason(reason)) {
    return NextResponse.json({ ok: false, error: "יש לבחור סיבת עיכוב" }, { status: 400 });
  }

  try {
    const result = await delayEmployeeTaskFast(prisma, {
      taskId: id,
      userId: strictUserId(session),
      manager: canManageAllTasks(session),
      reason,
      sid: session.sid,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, success: false, error: result.error, code: result.code },
        { status: result.status },
      );
    }

    const updatedTask = serializeWorkEmployeeTask(result.task);
    const nextAvailableTask = result.nextTask ? serializeWorkEmployeeTask(result.nextTask) : null;
    const response = NextResponse.json({
      ok: true,
      success: true,
      data: updatedTask,
      updatedTask,
      nextTask: nextAvailableTask,
      nextAvailableTask,
    });
    response.headers.set("Server-Timing", `auth;dur=${authMs}, db;dur=${result.dbMs}`);
    return response;
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/delay]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן לעכב משימה" }, { status: 500 });
  }
}
