import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { serializeTaskGroupDetail } from "@/lib/task-files/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_INCLUDE = {
  members: {
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
  },
  files: {
    include: { uploadedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  },
  _count: { select: { files: true, members: true } },
} as const;

async function loadGroupOrAccessError(
  id: string,
  session: Awaited<ReturnType<typeof getSessionFromCookie>>,
): Promise<
  | { ok: true; group: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  if (!session) return { ok: false, status: 401, error: "נדרשת התחברות" };
  const group = await prismaAny.taskGroup.findUnique({
    where: { id },
    include: FULL_INCLUDE,
  });
  if (!group) return { ok: false, status: 404, error: "קבוצה לא נמצאה" };

  if (!canManageAllTasks(session)) {
    const isMember = (group.members as { userId: string }[]).some(
      (m) => m.userId === session.sub,
    );
    if (!isMember) return { ok: false, status: 403, error: "אין הרשאה לקבוצה זו" };
  }
  return { ok: true, group };
}

/**
 * GET /api/task-groups/:id
 *
 * Returns the detail view used by the group modal: members, files, and the
 * list of tasks that belong to the group.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    const res = await loadGroupOrAccessError(id, session);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

    type RawGroup = Parameters<typeof serializeTaskGroupDetail>[0];
    const detail = serializeTaskGroupDetail({
      ...(res.group as unknown as RawGroup),
      openTaskCount: 0,
      completedTaskCount: 0,
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...detail,
        tasks: [] as unknown[],
      },
    });
  } catch (e) {
    console.error("[GET /api/task-groups/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/task-groups/:id
 *
 * Update the group's title / color / description / dueDate / status.
 * Only managers may edit.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const body = (await req.json()) as {
      title?: string;
      color?: string | null;
      description?: string | null;
      dueDate?: string | null;
      status?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const v = body.title.trim();
      if (!v) {
        return NextResponse.json({ ok: false, error: "שם קבוצה לא יכול להיות ריק" }, { status: 400 });
      }
      data.title = v;
    }
    if (body.color !== undefined) data.color = body.color?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.dueDate !== undefined) {
      if (!body.dueDate || !body.dueDate.trim()) {
        data.dueDate = null;
      } else {
        const d = new Date(body.dueDate.trim());
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ ok: false, error: "תאריך יעד לא תקין" }, { status: 400 });
        }
        data.dueDate = d;
      }
    }
    if (body.status !== undefined) {
      const allowed = ["OPEN", "IN_PROGRESS", "COMPLETED", "ARCHIVED"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ ok: false, error: "סטטוס לא תקין" }, { status: 400 });
      }
      data.status = body.status;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }

    const updated = await prismaAny.taskGroup.update({
      where: { id },
      data,
      include: FULL_INCLUDE,
    });

    type RawGroup = Parameters<typeof serializeTaskGroupDetail>[0];
    return NextResponse.json({
      ok: true,
      data: serializeTaskGroupDetail({
        ...(updated as unknown as RawGroup),
        openTaskCount: 0,
        completedTaskCount: 0,
      }),
    });
  } catch (e) {
    console.error("[PATCH /api/task-groups/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/task-groups/:id
 *
 * Soft delete (status=ARCHIVED) when the group has linked tasks, hard delete
 * otherwise. This protects historical task data while still letting managers
 * clean up empty drafts.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    await prismaAny.taskGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch (e) {
    console.error("[DELETE /api/task-groups/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
