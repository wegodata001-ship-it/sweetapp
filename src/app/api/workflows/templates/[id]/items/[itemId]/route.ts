import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkflowTemplateDetail } from "@/lib/workflows/serialize";

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

async function returnTemplate(templateId: string) {
  const row = await prismaAny.workflowTemplate.findUnique({
    where: { id: templateId },
    include: TEMPLATE_DETAIL_INCLUDE,
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "תבנית לא נמצאה" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: serializeWorkflowTemplateDetail(row) });
}

/**
 * PATCH /api/workflows/templates/:id/items/:itemId
 *
 * Customize a single template item (minutes override, title override).
 * Manager-only.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id, itemId } = await ctx.params;
    const body = (await req.json()) as {
      minutesOverride?: number | null;
      titleOverride?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (body.minutesOverride !== undefined) {
      if (body.minutesOverride === null) {
        data.minutesOverride = null;
      } else {
        const n = Number(body.minutesOverride);
        if (!Number.isFinite(n) || n < 0 || n > 8 * 60) {
          return NextResponse.json({ ok: false, error: "זמן יעד לא תקין" }, { status: 400 });
        }
        data.minutesOverride = Math.round(n);
      }
    }
    if (body.titleOverride !== undefined) {
      const v = body.titleOverride?.toString().trim();
      data.titleOverride = v || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }
    await prismaAny.workflowTemplateItem.update({ where: { id: itemId }, data });
    await prismaAny.workflowTemplate.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
    return returnTemplate(id);
  } catch (e) {
    console.error("[PATCH /api/workflows/templates/:id/items/:itemId]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workflows/templates/:id/items/:itemId
 *
 * Remove a single item from a template and re-pack remaining orderIndexes.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id, itemId } = await ctx.params;
    await prismaAny.workflowTemplateItem.delete({ where: { id: itemId } });
    // Repack indexes
    const remaining = await prismaAny.workflowTemplateItem.findMany({
      where: { templateId: id },
      orderBy: { orderIndex: "asc" },
      select: { id: true },
    });
    await prismaAny.$transaction(
      (remaining as { id: string }[]).map((it, idx) =>
        prismaAny.workflowTemplateItem.update({
          where: { id: it.id },
          data: { orderIndex: idx },
        }),
      ),
    );
    await prismaAny.workflowTemplate.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
    return returnTemplate(id);
  } catch (e) {
    console.error("[DELETE /api/workflows/templates/:id/items/:itemId]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
