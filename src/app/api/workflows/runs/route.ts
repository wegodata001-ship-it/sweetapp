import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  canViewAllWorkflowRuns,
  filterWorkflowRunsForUser,
  logStrictScope,
  strictUserId,
} from "@/lib/auth/strict-user-isolation";
import { canManageAllTasks, viewerMayAccessTaskAssignee } from "@/lib/tasks/task-access";
import { logTaskAccessBlocked } from "@/lib/work-tasks/task-security-log";
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
 * - Employee portal (default): assigneeId = session.sub ONLY
 * - Manager: ?managerView=1 + הרשאת tasks — כל הריצות
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
    const uid = strictUserId(session);
    if (session.role === UserRole.EMPLOYEE && searchParams.get("managerView") === "1") {
      logTaskAccessBlocked({
        route: "GET /api/workflows/runs",
        userId: uid,
        reason: "employee_manager_view_denied",
      });
    }
    const managerView =
      searchParams.get("managerView") === "1" && canViewAllWorkflowRuns(session);

    const where: Record<string, unknown> = { deletedAt: null };

    if (!managerView) {
      where.assigneeId = uid;
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

    let rows = await prismaAny.workflowRun.findMany({
      where,
      include: RUN_SUMMARY_INCLUDE,
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
      take: 200,
    });

    if (!managerView) {
      rows = filterWorkflowRunsForUser(rows as { assigneeId: string }[], uid);
    }

    type Row = Parameters<typeof serializeWorkflowRunSummary>[0];

    logStrictScope("[GET /api/workflows/runs]", session, {
      managerView,
      returnedRuns: rows.length,
      returnedAssignees: (rows as { assigneeId: string; assignee?: { fullName: string } }[]).map(
        (r) => ({ id: r.assigneeId, name: r.assignee?.fullName }),
      ),
    });

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

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    if (!canManageAllTasks(session)) {
      logTaskAccessBlocked({
        route: "POST /api/workflows/runs",
        userId: strictUserId(session),
        reason: "employee_cannot_create_run",
      });
      return NextResponse.json(
        { ok: false, error: "רק מנהל יכול ליצור workflow", code: "MANAGER_ONLY" },
        { status: 403 },
      );
    }
    const body = (await req.json()) as {
      templateId?: string;
      assigneeId?: string;
      notes?: string | null;
    };
    const templateId = (body.templateId ?? "").trim();
    let assigneeId = (body.assigneeId ?? "").trim();
    if (!templateId || !assigneeId) {
      return NextResponse.json(
        { ok: false, error: "חובה לציין תבנית ועובד" },
        { status: 400 },
      );
    }

    if (!(await viewerMayAccessTaskAssignee(session, assigneeId))) {
      return NextResponse.json(
        { ok: false, error: "הריצה אינה משויכת לחשבון שלך", code: "EMPLOYEE_OWNERSHIP_MISMATCH" },
        { status: 403 },
      );
    }

    const template = await prismaAny.workflowTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
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
            description: it.task.description,
            color: it.task.color,
            estimatedMinutes: it.minutesOverride ?? it.task.estimatedMinutes,
            requireLateReason: it.task.requireLateReason,
            orderIndex: idx,
          })),
        },
      },
      include: RUN_SUMMARY_INCLUDE,
    });

    type Row = Parameters<typeof serializeWorkflowRunDetail>[0];
    return NextResponse.json({ ok: true, data: serializeWorkflowRunDetail(created as unknown as Row) });
  } catch (e) {
    console.error("[POST /api/workflows/runs]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
