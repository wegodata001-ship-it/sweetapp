import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { UserRole } from "@prisma/client";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { logTaskAccessBlocked } from "@/lib/work-tasks/task-security-log";
import {
  serializeWorkflowTemplateDetail,
  serializeWorkflowTemplateSummary,
} from "@/lib/workflows/serialize";

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
 * GET /api/workflows/templates
 *
 * Returns all workflow templates available to the active workspace.
 * `?includeArchived=1` exposes archived ones.
 *
 * Each row carries a precomputed `total_minutes` so the launcher UI can show
 * the workflow length without an extra round-trip.
 */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    if (session.role === UserRole.EMPLOYEE) {
      logTaskAccessBlocked({
        route: "GET /api/workflows/templates",
        userId: session.sub,
        reason: "employee_templates_denied",
      });
      return NextResponse.json({ ok: true, data: [] });
    }
    const { searchParams } = req.nextUrl;
    const includeArchived = searchParams.get("includeArchived") === "1";
    const q = (searchParams.get("q") ?? "").trim();

    const where: Record<string, unknown> = { deletedAt: null };
    if (!includeArchived) where.archivedAt = null;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prismaAny.workflowTemplate.findMany({
      where,
      include: TEMPLATE_DETAIL_INCLUDE,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });
    type Row = Parameters<typeof serializeWorkflowTemplateSummary>[0];
    return NextResponse.json({
      ok: true,
      data: rows.map((r: Row) => serializeWorkflowTemplateSummary(r)),
    });
  } catch (e) {
    console.error("[GET /api/workflows/templates]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workflows/templates
 *
 * Create a new template. Manager-only. Body may include `items`, an array of
 * library task references — each entry is an object
 * `{ taskId, orderIndex?, minutesOverride?, titleOverride? }`. When `items` is
 * empty/missing we create an empty template the user can populate via the
 * items endpoint.
 *
 * If a `duplicateFromId` is supplied the new template inherits all items from
 * the source template (deep copy with new ids).
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      color?: string | null;
      duplicateFromId?: string | null;
      items?: {
        taskId: string;
        orderIndex?: number;
        minutesOverride?: number | null;
        titleOverride?: string | null;
      }[];
    };
    const title = (body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "חובה לציין שם תבנית" }, { status: 400 });
    }

    let sourceItems:
      | {
          taskId: string;
          orderIndex: number;
          minutesOverride: number | null;
          titleOverride: string | null;
        }[]
      | null = null;
    if (body.duplicateFromId) {
      const source = await prismaAny.workflowTemplate.findFirst({
        where: { id: body.duplicateFromId, deletedAt: null },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });
      if (!source) {
        return NextResponse.json(
          { ok: false, error: "תבנית מקור לא נמצאה" },
          { status: 400 },
        );
      }
      sourceItems = (source.items as {
        taskId: string;
        orderIndex: number;
        minutesOverride: number | null;
        titleOverride: string | null;
      }[]).map((it, idx) => ({
        taskId: it.taskId,
        orderIndex: idx,
        minutesOverride: it.minutesOverride ?? null,
        titleOverride: it.titleOverride ?? null,
      }));
    }

    const itemsInput =
      sourceItems ??
      (Array.isArray(body.items)
        ? body.items.map((it, idx) => ({
            taskId: String(it.taskId),
            orderIndex: it.orderIndex ?? idx,
            minutesOverride:
              typeof it.minutesOverride === "number" ? Math.round(it.minutesOverride) : null,
            titleOverride: it.titleOverride?.toString().trim() || null,
          }))
        : []);

    if (itemsInput.length > 0) {
      const ids = [...new Set(itemsInput.map((i) => i.taskId))];
      const tasks = await prismaAny.workflowTask.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const validIds = new Set(tasks.map((t: { id: string }) => t.id));
      const missing = ids.filter((id) => !validIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { ok: false, error: `משימות לא קיימות במאגר: ${missing.join(", ")}` },
          { status: 400 },
        );
      }
    }

    const created = await prismaAny.workflowTemplate.create({
      data: {
        title,
        description: body.description?.trim() || null,
        color: body.color?.trim() || null,
        createdById: session.sub,
        items: itemsInput.length
          ? {
              create: itemsInput.map((it, idx) => ({
                taskId: it.taskId,
                orderIndex: it.orderIndex ?? idx,
                minutesOverride: it.minutesOverride,
                titleOverride: it.titleOverride,
              })),
            }
          : undefined,
      },
      include: TEMPLATE_DETAIL_INCLUDE,
    });

    return NextResponse.json({ ok: true, data: serializeWorkflowTemplateDetail(created) });
  } catch (e) {
    console.error("[POST /api/workflows/templates]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
