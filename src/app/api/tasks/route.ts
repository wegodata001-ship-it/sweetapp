import { NextRequest, NextResponse } from "next/server";
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
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const tab = searchParams.get("tab") ?? "all";
    const q = searchParams.get("q")?.trim() ?? "";
    const employeeId = searchParams.get("employeeId")?.trim() ?? "";
    const department = searchParams.get("department")?.trim() ?? "";
    const priority = searchParams.get("priority")?.trim() ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const scope = searchParams.get("scope") ?? "";

    const session = await getSessionFromCookie();
    let userEmployeeId: string | null = null;
    if (session?.sub) {
      const u = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { employeeId: true },
      });
      userEmployeeId = u?.employeeId ?? null;
    }

    const et = getEmployeeTaskOrm();
    const where: Record<string, unknown> = {};

    if (scope === "worker") {
      if (!userEmployeeId) {
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
          meta: { user_employee_id: null },
        });
      }
      where.employeeId = userEmployeeId;
      where.status = { not: "completed" };
    } else {
      if (q) {
        where.OR = [
          { description: { contains: q } },
          { title: { contains: q } },
          { employee: { name: { contains: q } } },
        ];
      }
      if (employeeId) where.employeeId = employeeId;
      if (department) where.employee = { department };
      if (priority && PRIORITY_KEYS.includes(priority as TaskPriorityKey)) {
        where.priority = priority;
      }

      const now = new Date();
      const dueParts: Record<string, Date> = {};
      if (dateFrom) dueParts.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dueParts.lte = end;
      }

      if (tab === "mine") {
        if (userEmployeeId) where.employeeId = userEmployeeId;
        else where.AND = [{ id: { in: [] } }];
      } else if (tab === "overdue") {
        where.NOT = { status: "completed" };
        dueParts.lt = now;
      } else if (tab === "completed") {
        where.status = "completed";
      } else if (tab === "in_progress") {
        where.status = "in_progress";
      }

      if (Object.keys(dueParts).length > 0) {
        where.dueAt = dueParts;
      }
    }

    const now = new Date();

    const [rows, openGroups, totalOpen, totalDone, dashTotal, dashProgress, dashDone, dashOverdue, dashUrgent] =
      await Promise.all([
        et.findMany({
          where,
          include: {
            employee: { select: { id: true, name: true, role: true, department: true } },
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        }) as Promise<Parameters<typeof serializeEmployeeTask>[0][]>,
        et.groupBy({
          by: ["employeeId"],
          where: { status: { not: "completed" } },
          _count: { _all: true },
        }),
        et.count({ where: { status: { not: "completed" } } }),
        et.count({ where: { status: "completed" } }),
        et.count({}),
        et.count({ where: { status: "in_progress" } }),
        et.count({ where: { status: "completed" } }),
        et.count({
          where: {
            NOT: { status: "completed" },
            dueAt: { lt: now },
          },
        }),
        et.count({
          where: {
            priority: "urgent",
            NOT: { status: "completed" },
          },
        }),
      ]);

    const empIds = [...new Set(openGroups.map((g: { employeeId: string }) => g.employeeId))];
    const emps =
      empIds.length > 0
        ? await prisma.employee.findMany({
            where: { id: { in: empIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(emps.map((e) => [e.id, e.name]));

    const openByEmployee = openGroups.map((g: { employeeId: string; _count: { _all: number } }) => ({
      employee_id: g.employeeId,
      name: nameById.get(g.employeeId) ?? "",
      open_count: g._count._all,
    }));

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
        },
      },
      meta: { user_employee_id: userEmployeeId },
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
      employeeId?: string;
      title?: string | null;
      description?: string;
      priority?: string;
      dueAt?: string;
    };

    if (
      !body.employeeId?.trim() ||
      !body.title?.trim() ||
      !body.description?.trim() ||
      !body.dueAt?.trim()
    ) {
      return NextResponse.json(
        { ok: false, error: "חובה: עובד, כותרת, תיאור ותאריך יעד" },
        { status: 400 },
      );
    }

    const due = new Date(body.dueAt);
    if (!Number.isFinite(due.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך יעד לא תקין" }, { status: 400 });
    }

    const priority =
      body.priority && MANAGER_TASK_PRIORITIES.includes(body.priority as ManagerTaskPriority)
        ? body.priority
        : "normal";

    const emp = await prisma.employee.findUnique({ where: { id: body.employeeId.trim() } });
    if (!emp) return NextResponse.json({ ok: false, error: "עובד לא נמצא" }, { status: 400 });

    const createdById =
      session && canManageAllTasks(session) ? session.sub : null;

    const etPost = getEmployeeTaskOrm();
    const row = (await etPost.create({
      data: {
        employeeId: emp.id,
        title: body.title.trim(),
        description: body.description.trim(),
        priority,
        status: "pending",
        startedAt: null,
        dueAt: due,
        createdById,
      },
      include: {
        employee: { select: { id: true, name: true, role: true, department: true } },
      },
    })) as Parameters<typeof serializeEmployeeTask>[0];

    return NextResponse.json({ ok: true, data: serializeEmployeeTask(row) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
