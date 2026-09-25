import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { readTaskActionSession, startEmployeeTaskFast } from "@/lib/work-tasks/fast-task-actions";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const authStarted = performance.now();
  const session = await readTaskActionSession();
  const authMs = Math.round(performance.now() - authStarted);
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const userId = strictUserId(session);

  try {
    const result = await startEmployeeTaskFast(prisma, {
      taskId: id,
      userId,
      manager: canManageAllTasks(session),
      sid: session.sid,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, success: false, error: result.error, code: result.code },
        { status: result.status },
      );
    }

    const task = serializeWorkEmployeeTask(result.task);
    const response = NextResponse.json({
      ok: true,
      success: true,
      data: task,
      task,
      startedAt: task.started_at,
    });
    response.headers.set("Server-Timing", `auth;dur=${authMs}, db;dur=${result.dbMs}`);
    return response;
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/start]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן להתחיל משימה" }, { status: 500 });
  }
}
