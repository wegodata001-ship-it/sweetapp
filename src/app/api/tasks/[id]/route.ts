import { NextRequest, NextResponse } from "next/server";
import { prisma, getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { PRIORITY_KEYS, type TaskPriorityKey } from "@/lib/tasks/helpers";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string | null;
      description?: string;
      priority?: string;
      status?: string;
      dueAt?: string | null;
      employeeId?: string;
      mark_complete?: boolean;
    };

    const et = getEmployeeTaskOrm();
    const existing = (await et.findUnique({
      where: { id },
      include: { employee: { select: { id: true, name: true, role: true, department: true } } },
    })) as Parameters<typeof serializeEmployeeTask>[0] | null;
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = body.title?.trim() ?? "";
      if (!t) {
        return NextResponse.json({ ok: false, error: "כותרת חובה" }, { status: 400 });
      }
      data.title = t;
    }
    if (body.description !== undefined) data.description = body.description.trim();
    if (body.priority !== undefined && PRIORITY_KEYS.includes(body.priority as TaskPriorityKey)) {
      data.priority = body.priority;
    }
    if (body.dueAt !== undefined && body.dueAt !== null) {
      const d = new Date(body.dueAt);
      if (Number.isFinite(d.getTime())) data.dueAt = d;
    }
    if (body.employeeId !== undefined) {
      const emp = await prisma.employee.findUnique({ where: { id: body.employeeId } });
      if (!emp) return NextResponse.json({ ok: false, error: "עובד לא נמצא" }, { status: 400 });
      data.employeeId = emp.id;
    }

    const wantComplete = body.mark_complete === true || body.status === "completed";
    if (wantComplete) {
      data.status = "completed";
      data.completedAt = new Date();
      if (!existing.startedAt) {
        data.startedAt = new Date();
      }
    } else if (body.status === "pending") {
      data.status = "pending";
      data.completedAt = null;
      data.startedAt = null;
    } else if (body.status === "in_progress") {
      data.status = "in_progress";
      data.completedAt = null;
      if (!existing.startedAt) {
        data.startedAt = new Date();
      }
    }

    const updated = (await et.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, name: true, role: true, department: true } } },
    })) as Parameters<typeof serializeEmployeeTask>[0];

    return NextResponse.json({ ok: true, data: serializeEmployeeTask(updated) });
  } catch (e) {
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
    await getEmployeeTaskOrm().delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
