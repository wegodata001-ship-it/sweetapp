import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/task-groups/:id/members
 *
 * Replace the group's member set with the provided `userIds` (idempotent).
 * Only managers may modify membership.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const body = (await req.json()) as { userIds?: string[] };
    const userIds = Array.isArray(body.userIds)
      ? [...new Set(body.userIds.map((s) => s?.trim()).filter(Boolean))]
      : [];

    const exists = await prismaAny.taskGroup.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ ok: false, error: "קבוצה לא נמצאה" }, { status: 404 });
    }

    // Validate all user ids exist + active
    if (userIds.length > 0) {
      const valid = await prismaAny.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true },
      });
      const validSet = new Set(valid.map((u: { id: string }) => u.id));
      const missing = userIds.filter((u: string) => !validSet.has(u));
      if (missing.length > 0) {
        return NextResponse.json(
          { ok: false, error: `משתמש לא נמצא או אינו פעיל: ${missing.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // Idempotent replace
    await prismaAny.taskGroupMember.deleteMany({ where: { groupId: id } });
    if (userIds.length > 0) {
      await prismaAny.taskGroupMember.createMany({
        data: userIds.map((userId) => ({ groupId: id, userId })),
        skipDuplicates: true,
      });
    }

    const members = await prismaAny.taskGroupMember.findMany({
      where: { groupId: id },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    });
    return NextResponse.json({ ok: true, data: members });
  } catch (e) {
    console.error("[POST /api/task-groups/:id/members]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
