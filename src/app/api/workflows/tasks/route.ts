import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeWorkflowTask } from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workflows/tasks
 *
 * List the reusable task library. Authenticated users see active tasks;
 * managers can pass `?includeArchived=1` to include archived ones.
 *
 * The response includes `template_usage_count` so the library UI can show
 * "used in N templates".
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
    const includeArchived = searchParams.get("includeArchived") === "1";
    const q = (searchParams.get("q") ?? "").trim();

    const where: Record<string, unknown> = {};
    if (!includeArchived) where.archivedAt = null;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prismaAny.workflowTask.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: { _count: { select: { templateItems: true } } },
      take: 500,
    });

    type Row = Parameters<typeof serializeWorkflowTask>[0];
    return NextResponse.json({ ok: true, data: rows.map((r: Row) => serializeWorkflowTask(r)) });
  } catch (e) {
    console.error("[GET /api/workflows/tasks]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workflows/tasks
 *
 * Create a new library task. Manager-only.
 *
 * Body:
 *  - title (required)
 *  - description (optional)
 *  - estimatedMinutes (required, 0..480)
 *  - requireLateReason (default true)
 *  - color (HEX optional)
 *  - sortOrder (optional, default = max+1)
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
      estimatedMinutes?: number | string;
      requireLateReason?: boolean;
      color?: string | null;
      sortOrder?: number | string;
    };
    const title = (body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "חובה לציין שם משימה" }, { status: 400 });
    }
    const minutes = Number(body.estimatedMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 8 * 60) {
      return NextResponse.json(
        { ok: false, error: "זמן יעד לא תקין (0..480)" },
        { status: 400 },
      );
    }

    let sortOrder: number;
    if (body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== "") {
      const n = Number(body.sortOrder);
      sortOrder = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    } else {
      const max = await prismaAny.workflowTask.aggregate({ _max: { sortOrder: true } });
      sortOrder = ((max?._max?.sortOrder as number | null) ?? 0) + 1;
    }

    const created = await prismaAny.workflowTask.create({
      data: {
        title,
        description: body.description?.trim() || null,
        estimatedMinutes: Math.round(minutes),
        requireLateReason: body.requireLateReason !== false,
        color: body.color?.trim() || null,
        sortOrder,
        createdById: session.sub,
      },
    });
    return NextResponse.json({ ok: true, data: serializeWorkflowTask(created) });
  } catch (e) {
    console.error("[POST /api/workflows/tasks]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
