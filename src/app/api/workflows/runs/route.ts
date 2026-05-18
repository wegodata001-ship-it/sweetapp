import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  canManageAllTasks,
  resolveEmployeeTaskAssigneeIdsForUser,
  viewerMayAccessTaskAssignee,
} from "@/lib/tasks/task-access";
import {
  serializeWorkflowRunDetail,
  serializeWorkflowRunSummary,
} from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_SUMMARY_INCLUDE = {
  template: { select: { id: true, title: true } },
  assignee: { select: { id: true, fullName: true } },
  items: {
    select: {
      id: true,
      runId: true,
      sourceTaskId: true,
      title: true,
      description: true,
      color: true,
      estimatedMinutes: true,
      requireLateReason: true,
      orderIndex: true,
      status: true,
      startedAt: true,
      completedAt: true,
      actualMinutes: true,
      isLate: true,
      lateReason: true,
    },
    orderBy: { orderIndex: "asc" },
  },
} as const;

/**
 * GET /api/workflows/runs
 *
 * Lists runs visible to the active user.
 *
 *  - Managers see all runs (filterable by `assigneeId`, `status`).
 *  - Employees only see their own runs.
 *
 * Optional filters:
 *  - status=IN_PROGRESS|COMPLETED|ABORTED
 *  - assigneeId=<uid>
 *  - includeCompleted=1 (managers)
 */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    const { searchParams } = req.nextUrl;
    const isManager = canManageAllTasks(session);
    const where: Record<string, unknown> = {};
    if (!isManager) {
      where.assigneeId = { in: await resolveEmployeeTaskAssigneeIdsForUser(session.sub) };
    } else {
      const assigneeId = searchParams.get("assigneeId");
      if (assigneeId) where.assigneeId = assigneeId;
    }
    const status = searchParams.get("status");
    if (status && ["IN_PROGRESS", "COMPLETED", "ABORTED"].includes(status)) {
      where.status = status;
    } else if (!searchParams.get("includeCompleted")) {
      where.status = "IN_PROGRESS";
    }

    const rows = await prismaAny.workflowRun.findMany({
      where,
      include: RUN_SUMMARY_INCLUDE,
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
      take: 200,
    });

    type Row = Parameters<typeof serializeWorkflowRunSummary>[0];
    return NextResponse.json({
      ok: true,
      data: rows.map((r: Row) => serializeWorkflowRunSummary(r)),
    });
  } catch (e) {
    console.error("[GET /api/workflows/runs]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workflows/runs
 *
 * Start a new run from a template. Manager-only (or the employee can start a
 * run for themselves via `assigneeId === session.sub`).
 *
 * Body: `{ templateId, assigneeId, notes? }`
 *
 * The run snapshots every item from the template — title, description, color,
 * estimated minutes (after override), requireLateReason — so the run remains
 * stable even if the library/template change later.
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    const body = (await req.json()) as {
      templateId?: string;
      assigneeId?: string;
      notes?: string | null;
    };
    const templateId = (body.templateId ?? "").trim();
    const assigneeId = (body.assigneeId ?? "").trim();
    if (!templateId || !assigneeId) {
      return NextResponse.json(
        { ok: false, error: "חובה לציין תבנית ועובד" },
        { status: 400 },
      );
    }
    const isManager = canManageAllTasks(session);
    if (!isManager && !(await viewerMayAccessTaskAssignee(session, assigneeId))) {
      return NextResponse.json(
        { ok: false, error: "הריצה אינה משויכת לחשבון שלך", code: "EMPLOYEE_OWNERSHIP_MISMATCH" },
        { status: 403 },
      );
    }

    const template = await prismaAny.workflowTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                description: true,
                color: true,
                estimatedMinutes: true,
                requireLateReason: true,
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });
    if (!template) {
      return NextResponse.json({ ok: false, error: "תבנית לא נמצאה" }, { status: 404 });
    }
    if (template.archivedAt) {
      return NextResponse.json(
        { ok: false, error: "התבנית בארכיון — לא ניתן להפעיל ריצה חדשה" },
        { status: 400 },
      );
    }
    if (!template.items || template.items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "התבנית ריקה — הוסיפו לפחות משימה אחת" },
        { status: 400 },
      );
    }

    const assignee = await prismaAny.user.findFirst({
      where: {
        id: assigneeId,
        role: { in: [UserRole.EMPLOYEE, UserRole.ADMIN] },
        isActive: true,
      },
      select: { id: true, fullName: true },
    });
    if (!assignee) {
      return NextResponse.json(
        { ok: false, error: "עובד לא קיים או אינו פעיל" },
        { status: 400 },
      );
    }

    type TmplItem = {
      taskId: string;
      orderIndex: number;
      minutesOverride: number | null;
      titleOverride: string | null;
      task: {
        id: string;
        title: string;
        description: string | null;
        color: string | null;
        estimatedMinutes: number;
        requireLateReason: boolean;
      };
    };

    const created = await prismaAny.workflowRun.create({
      data: {
        templateId: template.id,
        title: template.title,
        assigneeId: assignee.id,
        createdById: session.sub,
        notes: body.notes?.toString().trim() || null,
        currentIndex: 0,
        status: "IN_PROGRESS",
        items: {
          create: (template.items as TmplItem[]).map((it, idx) => ({
            sourceTaskId: it.taskId,
            title: it.titleOverride?.trim() || it.task.title,
            description: it.task.description ?? null,
            color: it.task.color ?? null,
            estimatedMinutes: it.minutesOverride ?? it.task.estimatedMinutes,
            requireLateReason: it.task.requireLateReason,
            orderIndex: idx,
            status: "PENDING",
          })),
        },
      },
      include: RUN_SUMMARY_INCLUDE,
    });

    return NextResponse.json({ ok: true, data: serializeWorkflowRunDetail(created) });
  } catch (e) {
    console.error("[POST /api/workflows/runs]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
