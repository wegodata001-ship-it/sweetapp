import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma, getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  MANAGER_TASK_PRIORITIES,
  PRIORITY_KEYS,
  type ManagerTaskPriority,
  type TaskPriorityKey,
} from "@/lib/tasks/helpers";
import { parseTaskDateInput, scheduledStartMs } from "@/lib/tasks/schedule";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";
import { taskDeadlinePassed } from "@/lib/tasks/helpers";

const ASSIGNEE_SELECT = { id: true, fullName: true, email: true, role: true } as const;

function normalizeStartTime(t: string): string | null {
  const s = t.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const tab = searchParams.get("tab") ?? "all";
    const q = searchParams.get("q")?.trim() ?? "";
    const assigneeIdParam = searchParams.get("assigneeId")?.trim() ?? searchParams.get("employeeId")?.trim() ?? "";
    const priority = searchParams.get("priority")?.trim() ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const scope = searchParams.get("scope") ?? "";
    const filterStatus = searchParams.get("filterStatus")?.trim() ?? "";
    const onlyOpen = searchParams.get("onlyOpen") === "1";
    const onlyOverdueFilter = searchParams.get("onlyOverdue") === "1";

    const session = await getSessionFromCookie();

    const et = getEmployeeTaskOrm();
    const where: Record<string, unknown> = {};

    if (scope === "worker") {
      if (!session?.sub) {
        return NextResponse.json({
          ok: true,
          data: [],
          stats: {
            open_by_employee: [],
            total_open: 0,
            total_completed: 0,
            progress: { done: 0, total: 0 },
            dashboard: {
              total: 0,
              in_progress: 0,
              completed: 0,
              overdue: 0,
              urgent_open: 0,
            },
          },
          meta: { assignee_user_id: null },
        });
      }
      where.assigneeId = session.sub;
      where.status = { not: "completed" };
    } else {
      if (q) {
        where.OR = [
          { description: { contains: q } },
          { title: { contains: q } },
          { assignee: { fullName: { contains: q } } },
          { assignee: { email: { contains: q } } },
        ];
      }
      if (assigneeIdParam) where.assigneeId = assigneeIdParam;
      if (priority && PRIORITY_KEYS.includes(priority as TaskPriorityKey)) {
        where.priority = priority;
      }

      const dateParts: Record<string, Date> = {};
      if (dateFrom) dateParts.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateParts.lte = end;
      }
      if (Object.keys(dateParts).length > 0) {
        where.taskDate = dateParts;
      }

      const statusFilterValues = ["pending", "in_progress", "completed", "problem", "rejected"];
      if (filterStatus && statusFilterValues.includes(filterStatus)) {
        where.status = filterStatus;
      } else if (onlyOpen) {
        where.status = { in: ["pending", "in_progress", "problem"] };
      } else if (tab === "mine") {
        if (session?.sub) where.assigneeId = session.sub;
        else where.AND = [{ id: { in: [] } }];
      } else if (tab === "overdue") {
        where.status = "pending";
      } else if (tab === "completed") {
        where.status = "completed";
      } else if (tab === "in_progress") {
        where.status = "in_progress";
      }
    }

    const nowMs = Date.now();

    let rows = (await et.findMany({
      where,
      include: {
        assignee: { select: ASSIGNEE_SELECT },
      },
      orderBy: [{ taskDate: "asc" }, { startTime: "asc" }, { createdAt: "desc" }],
    })) as Parameters<typeof serializeEmployeeTask>[0][];

    if (scope !== "worker" && tab === "overdue") {
      rows = rows.filter(
        (r) => r.status === "pending" && scheduledStartMs(r.taskDate, r.startTime) < nowMs,
      );
    }
    if (scope !== "worker" && onlyOverdueFilter) {
      rows = rows.filter(
        (r) =>
          r.status !== "completed" &&
          r.status !== "rejected" &&
          taskDeadlinePassed(r),
      );
    }

    const pendingForDash = (await et.findMany({
      where: { status: "pending" },
      select: { taskDate: true, startTime: true },
    })) as { taskDate: Date; startTime: string }[];
    const dashOverdue = pendingForDash.filter(
      (p) => scheduledStartMs(p.taskDate, p.startTime) < nowMs,
    ).length;

    const openGroups = await et.groupBy({
      by: ["assigneeId"],
      where: { status: { notIn: ["completed", "rejected"] } },
      _count: { _all: true },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [totalOpen, totalDone, dashTotal, dashProgress, dashDone, dashUrgent, completedToday] =
      await Promise.all([
        et.count({ where: { status: { notIn: ["completed", "rejected"] } } }),
        et.count({ where: { status: "completed" } }),
        et.count({}),
        et.count({ where: { status: "in_progress" } }),
        et.count({ where: { status: "completed" } }),
        et.count({
          where: {
            priority: "urgent",
            NOT: { status: { in: ["completed", "rejected"] } },
          },
        }),
        et.count({
          where: {
            status: "completed",
            completedAt: { gte: startOfToday, lte: endOfToday },
          },
        }),
      ]);

    const assigneeIds = [...new Set(openGroups.map((g: { assigneeId: string }) => g.assigneeId))];
    const users =
      assigneeIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    const openByEmployee = openGroups.map((g: { assigneeId: string; _count: { _all: number } }) => ({
      employee_id: g.assigneeId,
      name: nameById.get(g.assigneeId) ?? "",
      open_count: g._count._all,
    }));

    const topBusy =
      openByEmployee.length > 0
        ? [...openByEmployee].sort((a, b) => b.open_count - a.open_count)[0]
        : null;

    return NextResponse.json({
      ok: true,
      data: rows.map(serializeEmployeeTask),
      stats: {
        open_by_employee: openByEmployee,
        total_open: totalOpen,
        total_completed: totalDone,
        progress:
          totalOpen + totalDone > 0
            ? { done: totalDone, total: totalOpen + totalDone }
            : { done: 0, total: 0 },
        dashboard: {
          total: dashTotal,
          in_progress: dashProgress,
          completed: dashDone,
          overdue: dashOverdue,
          urgent_open: dashUrgent,
          completed_today: completedToday,
          top_busy:
            topBusy && topBusy.name
              ? {
                  employee_id: topBusy.employee_id,
                  name: topBusy.name,
                  open_count: topBusy.open_count,
                }
              : null,
        },
      },
      meta: { assignee_user_id: session?.sub ?? null, user_employee_id: null },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const body = (await req.json()) as {
      assigneeIds?: string[];
      employeeIds?: string[];
      employeeId?: string;
      title?: string | null;
      description?: string | null;
      priority?: string;
      taskDate?: string;
      startTime?: string;
      dueDate?: string | null;
    };

    const rawIds = Array.isArray(body.assigneeIds)
      ? body.assigneeIds
      : Array.isArray(body.employeeIds)
        ? body.employeeIds
        : body.employeeId
          ? [body.employeeId]
          : [];
    const assigneeIds = [...new Set(rawIds.map((id) => id?.trim()).filter(Boolean))] as string[];

    const startNorm = body.startTime ? normalizeStartTime(body.startTime) : null;

    if (!body.title?.trim() || !body.taskDate?.trim() || !startNorm || assigneeIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "חובה: לפחות עובד אחד, כותרת, תאריך ושעת התחלה" },
        { status: 400 },
      );
    }

    const taskDate = parseTaskDateInput(body.taskDate.trim());
    if (!Number.isFinite(taskDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
    }

    const priority =
      body.priority && MANAGER_TASK_PRIORITIES.includes(body.priority as ManagerTaskPriority)
        ? body.priority
        : "normal";

    const description = body.description?.trim() || null;
    const groupId = assigneeIds.length > 1 ? randomUUID() : null;
    const createdById = session.sub;

    let dueDateVal: Date | null = null;
    if (body.dueDate?.trim()) {
      const d = new Date(body.dueDate.trim());
      if (Number.isFinite(d.getTime())) dueDateVal = d;
    }

    const etPost = getEmployeeTaskOrm();
    const created: Parameters<typeof serializeEmployeeTask>[0][] = [];

    for (const uid of assigneeIds) {
      const user = await prisma.user.findFirst({
        where: {
          id: uid,
          role: UserRole.EMPLOYEE,
          isActive: true,
        },
      });
      if (!user) {
        return NextResponse.json(
          { ok: false, error: `משתמש לא נמצא או אינו עובד פעיל: ${uid}` },
          { status: 400 },
        );
      }

      const row = (await etPost.create({
        data: {
          assigneeId: user.id,
          groupId,
          title: body.title!.trim(),
          description,
          priority,
          status: "pending",
          startedAt: null,
          taskDate,
          startTime: startNorm,
          dueDate: dueDateVal,
          createdById,
        },
        include: {
          assignee: { select: ASSIGNEE_SELECT },
        },
      })) as Parameters<typeof serializeEmployeeTask>[0];

      created.push(row);
    }

    return NextResponse.json({
      ok: true,
      data: created.map(serializeEmployeeTask),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
