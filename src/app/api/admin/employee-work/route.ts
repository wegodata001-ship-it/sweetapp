import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  copyWorkTemplateToEmployee,
  copyWorkflowTemplateToEmployee,
  createSingleEmployeeTask,
  loadEmployeeWorkDay,
} from "@/lib/work-tasks/employee-work-service";

export const dynamic = "force-dynamic";

/** GET — סדר עבודה לעובד + תאריך */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const employeeId = req.nextUrl.searchParams.get("employeeId")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  if (!employeeId) {
    return NextResponse.json({ ok: false, error: "חובה employeeId" }, { status: 400 });
  }
  try {
    const data = await loadEmployeeWorkDay(employeeId, date);
    if (!data) {
      return NextResponse.json({ ok: false, error: "עובד לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[GET /api/admin/employee-work]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/** POST — משימה בודדת או קבוצה (עותק) */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as {
      kind?: "task" | "group";
      employeeId?: string;
      date?: string;
      workTemplateId?: string;
      workflowTemplateId?: string;
      color?: string | null;
      title?: string;
      estimatedMinutes?: number;
      description?: string | null;
      materials?: string | null;
      targetDueAt?: string | null;
      taskGroupId?: string | null;
      taskTemplateId?: string | null;
    };

    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "חובה employeeId" }, { status: 400 });
    }

    if (body.kind === "group" || body.workTemplateId || body.workflowTemplateId) {
      if (body.workTemplateId) {
        const r = await copyWorkTemplateToEmployee({
          employeeId,
          workTemplateId: body.workTemplateId,
          workDateStr: body.date,
          color: body.color,
        });
        return NextResponse.json({ ok: true, group: r.group, meta: r });
      }
      if (body.workflowTemplateId) {
        const r = await copyWorkflowTemplateToEmployee({
          employeeId,
          workflowTemplateId: body.workflowTemplateId,
          workDateStr: body.date,
          color: body.color,
        });
        return NextResponse.json({ ok: true, group: r.group, meta: r });
      }
      return NextResponse.json({ ok: false, error: "חובה מזהה תבנית" }, { status: 400 });
    }

    const task = await createSingleEmployeeTask({
      employeeId,
      title: body.title ?? "",
      estimatedMinutes: body.estimatedMinutes ?? 15,
      description: body.description,
      materials: body.materials,
      targetDueAt: body.targetDueAt,
      taskGroupId: body.taskGroupId,
      color: body.color,
      taskTemplateId: body.taskTemplateId,
      workDateStr: body.date,
    });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    console.error("[POST /api/admin/employee-work]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
