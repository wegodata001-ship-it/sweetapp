import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  deleteEmployeeTaskManager,
  loadEmployeeWorkDay,
  updateEmployeeTaskManager,
} from "@/lib/work-tasks/employee-work-service";
import { serializeEmployeeTask } from "@/lib/work-tasks/serialize-employee-work";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    title?: string;
    estimatedMinutes?: number;
    description?: string | null;
    materials?: string | null;
    targetDueAt?: string | null;
    color?: string | null;
  };
  try {
    const before = await prisma.employeeTask.findUnique({
      where: { id },
      include: { session: { select: { workDate: true } } },
    });
    if (!before) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    const updated = await updateEmployeeTaskManager(id, body);
    const date =
      before.session?.workDate instanceof Date
        ? before.session.workDate.toISOString().slice(0, 10)
        : undefined;
    return NextResponse.json({
      ok: true,
      task: serializeEmployeeTask(updated),
    });
  } catch (e) {
    console.error("[PATCH employee-work task]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const task = await prisma.employeeTask.findUnique({
      where: { id },
      include: { session: { select: { workDate: true } } },
    });
    if (!task) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    await deleteEmployeeTaskManager(id);
    const date =
      task.session?.workDate instanceof Date
        ? task.session.workDate.toISOString().slice(0, 10)
        : undefined;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE employee-work task]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
