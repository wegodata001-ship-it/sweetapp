import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkflowTask } from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/workflows/tasks/:id
 *
 * Update a library task. Manager-only. Any field may be sent in isolation.
 * Passing `archived: true` archives the task; `archived: false` reactivates it.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      estimatedMinutes?: number | string;
      requireLateReason?: boolean;
      color?: string | null;
      sortOrder?: number | string;
      archived?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const v = body.title.trim();
      if (!v) return NextResponse.json({ ok: false, error: "שם משימה לא יכול להיות ריק" }, { status: 400 });
      data.title = v;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.color !== undefined) data.color = body.color?.trim() || null;
    if (body.requireLateReason !== undefined) data.requireLateReason = !!body.requireLateReason;
    if (body.estimatedMinutes !== undefined) {
      const n = Number(body.estimatedMinutes);
      if (!Number.isFinite(n) || n < 0 || n > 8 * 60) {
        return NextResponse.json({ ok: false, error: "זמן יעד לא תקין (0..480)" }, { status: 400 });
      }
      data.estimatedMinutes = Math.round(n);
    }
    if (body.sortOrder !== undefined) {
      const n = Number(body.sortOrder);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "סדר לא תקין" }, { status: 400 });
      }
      data.sortOrder = Math.max(0, Math.round(n));
    }
    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }

    const updated = await prismaAny.workflowTask.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: serializeWorkflowTask(updated) });
  } catch (e) {
    console.error("[PATCH /api/workflows/tasks/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workflows/tasks/:id
 *
 * Soft-archive when the task is referenced by any template or historical run.
 * Hard-delete when nothing references it. Manager-only.
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
    const [templateUses, runUses] = await Promise.all([
      prismaAny.workflowTemplateItem.count({ where: { taskId: id } }),
      prismaAny.workflowRunItem.count({ where: { sourceTaskId: id } }),
    ]);
    if (templateUses > 0 || runUses > 0) {
      const archived = await prismaAny.workflowTask.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      return NextResponse.json({ ok: true, archived: true, data: serializeWorkflowTask(archived) });
    }
    await prismaAny.workflowTask.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch (e) {
    console.error("[DELETE /api/workflows/tasks/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
