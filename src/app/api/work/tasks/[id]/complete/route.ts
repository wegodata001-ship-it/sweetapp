import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { computeActualMinutes, isTaskLate } from "@/lib/tasks/helpers";
import { assertEmployeeOwnsWorkTask } from "@/lib/work-tasks/access";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

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

    const gate = await assertEmployeeOwnsWorkTask(session, task.employeeId);
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.error, code: gate.code },
        { status: gate.status },
      );
    }

    if (task.status === "COMPLETED") {
      return NextResponse.json({ ok: true, data: serializeWorkEmployeeTask(task) });
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

    const updated = await prisma.employeeTask.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt,
        delayReason: late ? reason || null : null,
      },
    });

    return NextResponse.json({ ok: true, data: serializeWorkEmployeeTask(updated) });
  } catch (e) {
    console.error("[POST /api/work/tasks/:id/complete]", e);
    return NextResponse.json({ ok: false, error: "לא ניתן לסיים משימה" }, { status: 500 });
  }
}
