import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { assertStrictAssignee } from "@/lib/auth/strict-user-isolation";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkflowRunDetail } from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_INCLUDE = {
  template: { select: { id: true, title: true } },
  assignee: { select: { id: true, fullName: true } },
  items: { orderBy: { orderIndex: "asc" } },
} as const;

async function assertAccess(
  id: string,
  session: Awaited<ReturnType<typeof getSessionFromCookie>>,
): Promise<
  | { ok: true; run: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string }
> {
  if (!session) return { ok: false, status: 401, error: "נדרשת התחברות" };
  const run = await prismaAny.workflowRun.findFirst({
    where: { id, deletedAt: null },
    include: RUN_INCLUDE,
  });
  if (!run) return { ok: false, status: 404, error: "ריצה לא נמצאה" };
  if (!assertStrictAssignee(session, run.assigneeId as string)) {
    return {
      ok: false,
      status: 403,
      error: "אין הרשאה לריצה זו",
      code: "EMPLOYEE_OWNERSHIP_MISMATCH",
    };
  }
  return { ok: true, run };
}

/**
 * GET /api/workflows/runs/:id
 *
 * Full run detail including ordered items + timer-relevant fields.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    const access = await assertAccess(id, session);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
      );
    }
    type Row = Parameters<typeof serializeWorkflowRunDetail>[0];
    return NextResponse.json({ ok: true, data: serializeWorkflowRunDetail(access.run as unknown as Row) });
  } catch (e) {
    console.error("[GET /api/workflows/runs/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workflows/runs/:id/abort
 *
 * We accept POST on the same URL for the "abort" verb (small surface area).
 * Body: `{ action: "abort", notes?: string }`. Manager or assignee.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    const access = await assertAccess(id, session);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error, ...(access.code ? { code: access.code } : {}) },
        { status: access.status },
      );
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string; notes?: string };
    if (body.action !== "abort") {
      return NextResponse.json({ ok: false, error: "פעולה לא נתמכת" }, { status: 400 });
    }
    const run = access.run as { id: string; status: string };
    if (run.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { ok: false, error: "ניתן לבטל רק ריצה פעילה" },
        { status: 400 },
      );
    }
    await prismaAny.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "ABORTED",
        abortedAt: new Date(),
        notes: body.notes?.toString().trim() || undefined,
      },
    });
    // Any ACTIVE item is closed as SKIPPED with no late reason.
    await prismaAny.workflowRunItem.updateMany({
      where: { runId: run.id, status: "ACTIVE" },
      data: { status: "SKIPPED" },
    });
    const refreshed = await prismaAny.workflowRun.findUnique({
      where: { id: run.id },
      include: RUN_INCLUDE,
    });
    return NextResponse.json({
      ok: true,
      data: serializeWorkflowRunDetail(refreshed),
    });
  } catch (e) {
    console.error("[POST /api/workflows/runs/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workflows/runs/:id
 *
 * Manager-only hard delete (useful for clearing test runs). Refuses to delete
 * a still-active run.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const run = await prismaAny.workflowRun.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!run) return NextResponse.json({ ok: false, error: "ריצה לא נמצאה" }, { status: 404 });
    if (run.status === "IN_PROGRESS") {
      return NextResponse.json(
        { ok: false, error: "לא ניתן למחוק ריצה פעילה — בטל אותה קודם" },
        { status: 400 },
      );
    }
    await prismaAny.workflowRun.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/workflows/runs/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
