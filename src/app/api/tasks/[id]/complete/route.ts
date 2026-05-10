import { NextRequest, NextResponse } from "next/server";
import { getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";
import { assertCanAccessEmployeeTask } from "@/lib/tasks/task-access";

const ASSIGNEE_SELECT = { id: true, fullName: true, email: true, role: true } as const;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const session = await getSessionFromCookie();
    const et = getEmployeeTaskOrm();

    const task = (await et.findUnique({
      where: { id },
      include: { assignee: { select: ASSIGNEE_SELECT } },
    })) as Parameters<typeof serializeEmployeeTask>[0] | null;

    if (!task) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    if (task.status === "completed") {
      return NextResponse.json({ ok: false, error: "כבר סומנה כהושלמה" }, { status: 400 });
    }
    if (task.status === "rejected") {
      return NextResponse.json({ ok: false, error: "משימה נדחתה" }, { status: 400 });
    }

    const gate = assertCanAccessEmployeeTask(session, task.assigneeId);
    if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

    const updated = (await et.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
      include: { assignee: { select: ASSIGNEE_SELECT } },
    })) as Parameters<typeof serializeEmployeeTask>[0];

    return NextResponse.json({ ok: true, data: serializeEmployeeTask(updated) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
