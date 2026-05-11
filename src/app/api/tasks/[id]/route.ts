import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma, getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  EMPLOYEE_TASK_STATUS_KEYS,
  PRIORITY_KEYS,
  type TaskPriorityKey,
} from "@/lib/tasks/helpers";
import { parseTaskDateInput } from "@/lib/tasks/schedule";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";

const ASSIGNEE_SELECT = { id: true, fullName: true, email: true, role: true } as const;

function normTime(t: string): string | null {
  const s = t.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string | null;
      description?: string | null;
      priority?: string;
      status?: string;
      taskDate?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      dueDate?: string | null;
      assigneeId?: string;
      employeeId?: string;
      mark_complete?: boolean;
      employeeNote?: string | null;
    };

    const et = getEmployeeTaskOrm();
    const existing = (await et.findUnique({
      where: { id },
      include: { assignee: { select: ASSIGNEE_SELECT } },
    })) as Parameters<typeof serializeEmployeeTask>[0] | null;
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    const isManager = canManageAllTasks(session);
    const isAssignee = session.sub === existing.assigneeId;
    if (!isManager && !isAssignee) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    if (isAssignee && !isManager) {
      if (body.employeeNote !== undefined) {
        data.employeeNote = body.employeeNote?.trim() || null;
      }
      if (body.status !== undefined) {
        const st = body.status as string;
        if (!EMPLOYEE_TASK_STATUS_KEYS.includes(st as (typeof EMPLOYEE_TASK_STATUS_KEYS)[number])) {
          return NextResponse.json({ ok: false, error: "סטטוס לא חוקי" }, { status: 400 });
        }
        data.status = st;
        if (st === "completed") {
          data.completedAt = new Date();
          if (!existing.startedAt) data.startedAt = new Date();
        } else {
          data.completedAt = null;
          if (st === "pending") {
            data.startedAt = null;
          } else if (st === "in_progress" && !existing.startedAt) {
            data.startedAt = new Date();
          }
        }
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
      }
      const updated = (await et.update({
        where: { id },
        data,
        include: { assignee: { select: ASSIGNEE_SELECT } },
      })) as Parameters<typeof serializeEmployeeTask>[0];
      return NextResponse.json({ ok: true, data: serializeEmployeeTask(updated) });
    }

    if (body.title !== undefined) {
      const t = body.title?.trim() ?? "";
      if (!t) {
        return NextResponse.json({ ok: false, error: "כותרת חובה" }, { status: 400 });
      }
      data.title = t;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.employeeNote !== undefined) data.employeeNote = body.employeeNote?.trim() || null;
    if (body.priority !== undefined && PRIORITY_KEYS.includes(body.priority as TaskPriorityKey)) {
      data.priority = body.priority;
    }
    if (body.taskDate !== undefined && body.taskDate !== null) {
      const td = parseTaskDateInput(body.taskDate);
      if (!Number.isFinite(td.getTime())) {
        return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
      }
      data.taskDate = td;
    }
    if (body.startTime !== undefined && body.startTime !== null) {
      const st = normTime(body.startTime);
      if (!st) return NextResponse.json({ ok: false, error: "שעת התחלה לא תקינה" }, { status: 400 });
      data.startTime = st;
    }
    if (body.endTime !== undefined) {
      if (body.endTime === null || body.endTime === "") {
        data.endTime = null;
      } else {
        const et = normTime(body.endTime);
        if (!et) return NextResponse.json({ ok: false, error: "שעת סיום לא תקינה" }, { status: 400 });
        data.endTime = et;
      }
    }
    const nextStart = typeof data.startTime === "string" ? data.startTime : existing.startTime;
    const nextEnd =
      typeof data.endTime === "string"
        ? data.endTime
        : data.endTime === null
          ? null
          : existing.endTime ?? null;
    if (nextEnd && nextEnd < nextStart) {
      return NextResponse.json({ ok: false, error: "שעת סיום חייבת להיות אחרי שעת ההתחלה" }, { status: 400 });
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        data.dueDate = null;
      } else {
        const d = new Date(body.dueDate.trim());
        if (!Number.isFinite(d.getTime())) {
          return NextResponse.json({ ok: false, error: "תאריך יעד לא תקין" }, { status: 400 });
        }
        data.dueDate = d;
      }
    }
    const newAssignee = body.assigneeId ?? body.employeeId;
    if (newAssignee !== undefined) {
      const u = await prisma.user.findFirst({
        where: {
          id: newAssignee,
          role: UserRole.EMPLOYEE,
          isActive: true,
        },
      });
      if (!u) return NextResponse.json({ ok: false, error: "משתמש לא נמצא או אינו עובד פעיל" }, { status: 400 });
      data.assigneeId = u.id;
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
    } else if (
      body.status === "problem" ||
      body.status === "rejected"
    ) {
      data.status = body.status;
      data.completedAt = null;
    }

    const updated = (await et.update({
      where: { id },
      data,
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
