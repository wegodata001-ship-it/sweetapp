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

async function returnTemplate(id: string) {
  const row = await prismaAny.workflowTemplate.findUnique({
    where: { id },
    include: TEMPLATE_DETAIL_INCLUDE,
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "תבנית לא נמצאה" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: serializeWorkflowTemplateDetail(row) });
}

/**
 * POST /api/workflows/templates/:id/items
 *
 * Add one library task to the end of the template. Manager-only.
 * Body: `{ taskId, minutesOverride?, titleOverride? }`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      taskId?: string;
      minutesOverride?: number | null;
      titleOverride?: string | null;
    };
    const taskId = (body.taskId ?? "").trim();
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "חובה לציין משימה מהמאגר" }, { status: 400 });
    }
    const [template, task] = await Promise.all([
      prismaAny.workflowTemplate.findUnique({ where: { id }, select: { id: true } }),
      prismaAny.workflowTask.findUnique({ where: { id: taskId }, select: { id: true } }),
    ]);
    if (!template) {
      return NextResponse.json({ ok: false, error: "תבנית לא נמצאה" }, { status: 404 });
    }
    if (!task) {
      return NextResponse.json({ ok: false, error: "משימה לא קיימת במאגר" }, { status: 400 });
    }
    const max = await prismaAny.workflowTemplateItem.aggregate({
      where: { templateId: id },
      _max: { orderIndex: true },
    });
    const orderIndex = ((max?._max?.orderIndex as number | null) ?? -1) + 1;
    const minutes =
      typeof body.minutesOverride === "number" && Number.isFinite(body.minutesOverride)
        ? Math.max(0, Math.round(body.minutesOverride))
        : null;
    await prismaAny.workflowTemplateItem.create({
      data: {
        templateId: id,
        taskId,
        orderIndex,
        minutesOverride: minutes,
        titleOverride: body.titleOverride?.toString().trim() || null,
      },
    });
    await prismaAny.workflowTemplate.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
    return returnTemplate(id);
  } catch (e) {
    console.error("[POST /api/workflows/templates/:id/items]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/workflows/templates/:id/items
 *
 * Reorder items in-bulk. Manager-only. Body: `{ order: itemId[] }`.
 * Updates each item's `orderIndex` to match its position in the array.
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
    const body = (await req.json()) as { order?: string[] };
    const order = Array.isArray(body.order) ? body.order.filter(Boolean) : [];
    if (order.length === 0) {
      return NextResponse.json({ ok: false, error: "אין סדר חדש לעדכון" }, { status: 400 });
    }
    const existing = await prismaAny.workflowTemplateItem.findMany({
      where: { templateId: id },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r: { id: string }) => r.id));
    const filtered = order.filter((x) => existingSet.has(x));
    if (filtered.length === 0) {
      return NextResponse.json({ ok: false, error: "סדר חדש לא תואם לפריטים קיימים" }, { status: 400 });
    }
    await prismaAny.$transaction(
      filtered.map((itemId, idx) =>
        prismaAny.workflowTemplateItem.update({
          where: { id: itemId },
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
    console.error("[PATCH /api/workflows/templates/:id/items]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
