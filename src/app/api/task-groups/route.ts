import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeTaskGroupSummary } from "@/lib/task-files/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMBER_INCLUDE = {
  members: {
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
  },
  _count: { select: { files: true, members: true } },
} as const;

/**
 * GET /api/task-groups
 *
 * Lists task groups for the active workspace.
 *
 * - Admins / managers (with `tasks` permission) see all groups.
 * - Employees see only groups they're a member of.
 *
 * Each item includes its member list, totals (tasks / open / completed / files),
 * and the snake_case shape used everywhere else in this codebase.
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
    if (!includeArchived) {
      where.status = { not: "ARCHIVED" };
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    if (!canManageAllTasks(session)) {
      where.members = { some: { userId: session.sub } };
    }

    const rows = await prismaAny.taskGroup.findMany({
      where,
      include: MEMBER_INCLUDE,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    type GroupRow = Parameters<typeof serializeTaskGroupSummary>[0];
    const data = rows.map((r: GroupRow) =>
      serializeTaskGroupSummary({
        ...r,
        openTaskCount: 0,
        completedTaskCount: 0,
      }),
    );

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[GET /api/task-groups]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/task-groups
 *
 * Create a new task group. Only managers (`tasks` permission) may create
 * groups. The creator is automatically added as a member.
 *
 * Body:
 *  - title (required)
 *  - color (optional, e.g. "#10b981")
 *  - description (optional)
 *  - dueDate (optional, ISO date)
 *  - memberIds (optional, array of user ids to add)
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
      color?: string | null;
      description?: string | null;
      dueDate?: string | null;
      memberIds?: string[];
    };

    const title = (body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "חובה לציין שם קבוצה" }, { status: 400 });
    }

    const dueDate =
      body.dueDate && body.dueDate.trim()
        ? new Date(body.dueDate.trim())
        : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך יעד לא תקין" }, { status: 400 });
    }

    const memberIds = Array.isArray(body.memberIds)
      ? [...new Set(body.memberIds.map((s) => s?.trim()).filter(Boolean))]
      : [];
    // Always include the creator so the group is visible to them by default.
    if (!memberIds.includes(session.sub)) memberIds.push(session.sub);

    const created = await prismaAny.taskGroup.create({
      data: {
        title,
        color: body.color?.trim() || null,
        description: body.description?.trim() || null,
        dueDate,
        createdById: session.sub,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      include: MEMBER_INCLUDE,
    });

    return NextResponse.json({
      ok: true,
      data: serializeTaskGroupSummary({ ...created, completedTaskCount: 0 }),
    });
  } catch (e) {
    console.error("[POST /api/task-groups]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
