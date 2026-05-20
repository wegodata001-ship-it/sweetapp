import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { assertStrictAssignee, strictUserId } from "@/lib/auth/strict-user-isolation";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { logTaskAccessBlocked, logTaskStartDenied } from "@/lib/work-tasks/task-security-log";
import {
  canStartItem,
  computeRunStatus,
  elapsedMinutes,
  itemIsLate,
} from "@/lib/workflows/run-helpers";
import { serializeWorkflowRunDetail } from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_INCLUDE = {
  template: { select: { id: true, title: true } },
  assignee: { select: { id: true, fullName: true } },
  items: { orderBy: { orderIndex: "asc" } },
} as const;

type RunItemRow = {
  id: string;
  runId: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "SKIPPED";
  estimatedMinutes: number;
  requireLateReason: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  orderIndex: number;
  isLate: boolean;
  lateReason: string | null;
};

type RunRow = {
  id: string;
  assigneeId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  currentIndex: number;
  items: RunItemRow[];
};

async function loadRun(runId: string): Promise<RunRow | null> {
  const r = await prismaAny.workflowRun.findUnique({
    where: { id: runId },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  return (r as RunRow | null) ?? null;
}

async function returnRun(runId: string) {
  const row = await prismaAny.workflowRun.findUnique({
    where: { id: runId },
    include: RUN_INCLUDE,
  });
  if (!row) return NextResponse.json({ ok: false, error: "ריצה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ ok: true, data: serializeWorkflowRunDetail(row) });
}

/**
 * POST /api/workflows/runs/:id/items/:itemId
 *
 * The single endpoint that drives the sequential workflow. Body is
 * `{ action: "start" }` or `{ action: "complete", lateReason?, force? }`.
 *
 * Manager users may operate any item; employees may only operate items in
 * runs assigned to them.
 *
 * Server rules enforced here:
 *  - Sequential gating (no jumping ahead, no parallel ACTIVE items).
 *  - Late-reason: if an item exceeds its estimated minutes AND the item has
 *    `requireLateReason=true`, the caller must include a non-empty
 *    `lateReason` string. Otherwise the response is 422 with code
 *    `LATE_REASON_REQUIRED` so the UI can pop the modal.
 *  - Auto-completion: when the last item finishes the run transitions to
 *    COMPLETED with a `completedAt` timestamp.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    const { id, itemId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      lateReason?: string | null;
    };
    const action = (body.action ?? "").toString();

    const run = await loadRun(id);
    if (!run) return NextResponse.json({ ok: false, error: "ריצה לא נמצאה" }, { status: 404 });
    if (!assertStrictAssignee(session, run.assigneeId)) {
      const denied = {
        route: "POST /api/workflows/runs/:id/items/:itemId",
        userId: strictUserId(session),
        runId: id,
        itemId,
        assigneeId: run.assigneeId,
        action,
      };
      if (action === "start") logTaskStartDenied(denied);
      else logTaskAccessBlocked(denied);
      return NextResponse.json(
        {
          ok: false,
          error: "אין הרשאה",
          code: "EMPLOYEE_OWNERSHIP_MISMATCH",
        },
        { status: 403 },
      );
    }
    const target = run.items.find((it) => it.id === itemId);
    if (!target) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

    if (action === "start") {
      const guard = canStartItem(run.items, itemId, run.status);
      if (!guard.ok) {
        const errMap: Record<string, string> = {
          RUN_NOT_IN_PROGRESS: "הריצה אינה פעילה",
          ITEM_NOT_FOUND: "פריט לא נמצא",
          ITEM_NOT_PENDING: "המשימה כבר התחילה או הסתיימה",
          ANOTHER_ITEM_ACTIVE: "סיים קודם את המשימה הפעילה",
          EARLIER_ITEM_UNFINISHED: "יש לסיים את המשימה הקודמת לפני שזו תתחיל",
        };
        return NextResponse.json(
          { ok: false, error: errMap[guard.reason] ?? guard.reason, code: guard.reason },
          { status: 409 },
        );
      }
      await prismaAny.workflowRunItem.update({
        where: { id: itemId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
      await prismaAny.workflowRun.update({
        where: { id },
        data: { currentIndex: target.orderIndex },
      });
      return returnRun(id);
    }

    if (action === "complete") {
      if (target.status !== "ACTIVE") {
        return NextResponse.json(
          { ok: false, error: "ניתן לסיים רק משימה פעילה" },
          { status: 409 },
        );
      }
      const now = new Date();
      const isLate = target.startedAt
        ? itemIsLate(target.estimatedMinutes, target.startedAt, now)
        : false;
      const lateReason = (body.lateReason ?? "").toString().trim();
      if (isLate && target.requireLateReason && !lateReason) {
        return NextResponse.json(
          {
            ok: false,
            code: "LATE_REASON_REQUIRED",
            error: "המשימה הסתיימה באיחור — חובה לציין סיבה",
            estimatedMinutes: target.estimatedMinutes,
          },
          { status: 422 },
        );
      }
      const actualMinutes = target.startedAt
        ? elapsedMinutes(target.startedAt, now)
        : 0;
      await prismaAny.workflowRunItem.update({
        where: { id: itemId },
        data: {
          status: "COMPLETED",
          completedAt: now,
          actualMinutes,
          isLate,
          lateReason: isLate && lateReason ? lateReason : null,
        },
      });

      // Recompute run-level status / currentIndex.
      const refreshed = await loadRun(id);
      if (refreshed) {
        const overallStatus = computeRunStatus(refreshed.items);
        const nextPending = refreshed.items.find((it) => it.status === "PENDING");
        await prismaAny.workflowRun.update({
          where: { id },
          data: {
            status: overallStatus,
            completedAt: overallStatus === "COMPLETED" ? now : null,
            currentIndex: nextPending ? nextPending.orderIndex : target.orderIndex + 1,
          },
        });
      }
      return returnRun(id);
    }

    if (action === "skip") {
      if (!canManageAllTasks(session)) {
        return NextResponse.json(
          { ok: false, error: "רק מנהל יכול לדלג על משימה" },
          { status: 403 },
        );
      }
      if (target.status === "COMPLETED") {
        return NextResponse.json(
          { ok: false, error: "המשימה כבר הסתיימה" },
          { status: 409 },
        );
      }
      await prismaAny.workflowRunItem.update({
        where: { id: itemId },
        data: { status: "SKIPPED", completedAt: new Date() },
      });
      const refreshed = await loadRun(id);
      if (refreshed) {
        const overallStatus = computeRunStatus(refreshed.items);
        const nextPending = refreshed.items.find((it) => it.status === "PENDING");
        await prismaAny.workflowRun.update({
          where: { id },
          data: {
            status: overallStatus,
            completedAt: overallStatus === "COMPLETED" ? new Date() : null,
            currentIndex: nextPending ? nextPending.orderIndex : target.orderIndex + 1,
          },
        });
      }
      return returnRun(id);
    }

    return NextResponse.json({ ok: false, error: "פעולה לא נתמכת" }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/workflows/runs/:id/items/:itemId]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
