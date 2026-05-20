import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { getOrCreateActiveEmployeeWorkSession } from "@/lib/work-tasks/session";
import { resolveSingleUserForEmployee } from "@/lib/work-tasks/duplicate-employee-check";
import { notifyTaskAssigned } from "@/lib/notifications/task-flow";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/work-assign
 * מנהל בלבד — יוצר EmployeeTask עם assignedToUserId חובה.
 */
export async function POST(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await req.json()) as { workTemplateId?: string; employeeId?: string };
  const workTemplateId = String(body.workTemplateId ?? "").trim();
  const employeeId = String(body.employeeId ?? "").trim();
  if (!workTemplateId || !employeeId) {
    return NextResponse.json({ ok: false, error: "חובה workTemplateId ו-employeeId" }, { status: 400 });
  }

  try {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!emp) {
      return NextResponse.json({ ok: false, error: "עובד לא נמצא" }, { status: 404 });
    }

    const assignee = await resolveSingleUserForEmployee(employeeId);
    if (!assignee.ok) {
      return NextResponse.json(
        { ok: false, error: assignee.error, code: assignee.code },
        { status: assignee.code === "DUPLICATE_USER" ? 409 : 400 },
      );
    }

    const lines = await prisma.workTemplateTask.findMany({
      where: { templateId: workTemplateId },
      orderBy: { orderIndex: "asc" },
      include: { taskTemplate: true },
    });
    if (lines.length === 0) {
      return NextResponse.json({ ok: false, error: "תבנית ריקה או לא קיימת" }, { status: 400 });
    }

    const sessionRow = await getOrCreateActiveEmployeeWorkSession(employeeId);

    const created = await prisma.$transaction(
      lines.map((line) =>
        prisma.employeeTask.create({
          data: {
            employeeId,
            assignedToUserId: assignee.userId,
            sessionId: sessionRow.id,
            taskTemplateId: line.taskTemplateId,
            title: line.taskTemplate.title,
            description: line.taskTemplate.description,
            estimatedMinutes: line.taskTemplate.estimatedMinutes,
            orderIndex: line.orderIndex,
            status: "PENDING",
          },
        }),
      ),
    );

    console.log("[TASK CREATED]", {
      count: created.length,
      employeeId,
      assignedToUserId: assignee.userId,
      sessionId: sessionRow.id,
      by: session.sub,
    });

    let notificationsSent = 0;
    for (const task of created) {
      const sent = await notifyTaskAssigned({
        taskId: task.id,
        employeeId,
        title: task.title,
      });
      if (sent) notificationsSent += 1;
    }

    return NextResponse.json({
      ok: true,
      data: {
        count: created.length,
        sessionId: sessionRow.id,
        notificationsSent,
        assignedToUserId: assignee.userId,
      },
    });
  } catch (e) {
    console.error("[POST /api/admin/work-assign]", e);
    return NextResponse.json({ ok: false, error: "הקצאה נכשלה" }, { status: 500 });
  }
}
