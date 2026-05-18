import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { deleteTaskFileFromStorage } from "@/lib/task-files/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/task-files/:id
 *
 * Remove a task-group file:
 *  - Managers can delete any file.
 *  - Members can delete files they uploaded themselves.
 *
 * The DB row is removed first and the Supabase object is purged best-effort
 * afterwards. If the storage delete fails the row stays removed so the user
 * isn't blocked.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

    const row = await prismaAny.taskFile.findUnique({
      where: { id },
      select: { id: true, uploadedById: true, storagePath: true, groupId: true },
    });
    if (!row) {
      return NextResponse.json({ ok: false, error: "קובץ לא נמצא" }, { status: 404 });
    }

    if (!canManageAllTasks(session) && row.uploadedById !== session.sub) {
      return NextResponse.json({ ok: false, error: "אין הרשאה למחיקת הקובץ" }, { status: 403 });
    }

    await prismaAny.taskFile.delete({ where: { id } });
    if (row.storagePath) {
      await deleteTaskFileFromStorage(row.storagePath);
    }
    await prismaAny.taskGroup
      .update({ where: { id: row.groupId }, data: { updatedAt: new Date() } })
      .catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/task-files/:id]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
