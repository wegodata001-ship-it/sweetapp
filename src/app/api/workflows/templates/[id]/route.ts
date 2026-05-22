import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkflowTemplateDetail } from "@/lib/workflows/serialize";
import { deleteTaskGroup, TaskGroupServiceError } from "@/lib/workflows/task-group-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_DETAIL_INCLUDE = {
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
          archivedAt: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  },
} as const;

/**
 * GET /api/workflows/templates/:id
 *
 * Full template detail including ordered items (with task snapshot).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const row = await prismaAny.workflowTemplate.findFirst({
      where: { id, deletedAt: null },
      include: TEMPLATE_DETAIL_INCLUDE,
    });
    if (!row) return NextResponse.json({ ok: false, error: "תבנית לא נמצאה" }, { status: 404 });
    return NextResponse.json({ ok: true, data: serializeWorkflowTemplateDetail(row) });
  } catch (e) {
    console.error("[GET /api/workflows/templates/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/workflows/templates/:id
 *
 * Update the template metadata (title, description, color). Manager-only.
 * `archived: true/false` toggles archived state without affecting items.
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
      color?: string | null;
      archived?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const v = body.title.trim();
      if (!v) return NextResponse.json({ ok: false, error: "שם תבנית לא יכול להיות ריק" }, { status: 400 });
      data.title = v;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.color !== undefined) data.color = body.color?.trim() || null;
    if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }
    const updated = await prismaAny.workflowTemplate.update({
      where: { id },
      data,
      include: TEMPLATE_DETAIL_INCLUDE,
    });
    return NextResponse.json({ ok: true, data: serializeWorkflowTemplateDetail(updated) });
  } catch (e) {
    console.error("[PATCH /api/workflows/templates/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workflows/templates/:id
 *
 * Soft-delete group + related runs + workflow notifications. Manager-only.
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
    const result = await deleteTaskGroup(id);
    return NextResponse.json({ ok: true, softDeleted: true, ...result });
  } catch (e) {
    if (e instanceof TaskGroupServiceError) {
      const status = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status });
    }
    console.error("[DELETE /api/workflows/templates/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
