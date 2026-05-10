import { NextRequest, NextResponse } from "next/server";
import { getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";
import { assertCanAccessEmployeeTask } from "@/lib/tasks/task-access";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const session = await getSessionFromCookie();
    const et = getEmployeeTaskOrm();

    const task = (await et.findUnique({
      where: { id },
      include: { employee: { select: { id: true, name: true, role: true, department: true } } },
    })) as {
      id: string;
      employeeId: string;
      status: string;
      title: string | null;
      description: string;
      priority: string;
      dueAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      createdById: string | null;
      employee: { id: string; name: string; role: string | null; department: string | null };
    } | null;

    if (!task) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    if (task.status === "completed") {
      return NextResponse.json({ ok: false, error: "משימה כבר הושלמה" }, { status: 400 });
    }

    const gate = await assertCanAccessEmployeeTask(session, task.employeeId);
    if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

    if (task.status === "in_progress" && task.startedAt) {
      const row = { ...task };
      return NextResponse.json({ ok: true, data: serializeEmployeeTask(row) });
    }

    const updated = (await et.update({
      where: { id },
      data: {
        status: "in_progress",
        startedAt: task.startedAt ?? new Date(),
      },
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
