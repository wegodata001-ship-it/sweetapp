import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  TASK_FILE_ALLOWED_MIME,
  TASK_FILE_MAX_BYTES,
  isAllowedTaskFileMime,
  uploadTaskFile,
} from "@/lib/task-files/storage";
import { serializeTaskFile } from "@/lib/task-files/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertGroupAccess(
  groupId: string,
  session: Awaited<ReturnType<typeof getSessionFromCookie>>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!session) return { ok: false, status: 401, error: "נדרשת התחברות" };
  const group = await prismaAny.taskGroup.findUnique({
    where: { id: groupId },
    include: { members: { select: { userId: true } } },
  });
  if (!group) return { ok: false, status: 404, error: "קבוצה לא נמצאה" };
  if (canManageAllTasks(session)) return { ok: true };
  const isMember = (group.members as { userId: string }[]).some((m) => m.userId === session.sub);
  return isMember
    ? { ok: true }
    : { ok: false, status: 403, error: "אין הרשאה לקבוצה זו" };
}

/**
 * GET /api/task-groups/:id/files
 *
 * List files attached to a group (chronological, newest first).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    const access = await assertGroupAccess(id, session);
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }
    const rows = await prismaAny.taskFile.findMany({
      where: { groupId: id },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    type Row = Parameters<typeof serializeTaskFile>[0];
    return NextResponse.json({ ok: true, data: rows.map((r: Row) => serializeTaskFile(r)) });
  } catch (e) {
    console.error("[GET /api/task-groups/:id/files]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/task-groups/:id/files
 *
 * Upload a single file to the group. Expects `multipart/form-data` with:
 *   - file (File)        — the binary, max 25 MB
 *   - title (optional)   — display title, defaults to original filename
 *
 * Files are stored at `<bucket>/task-files/<companySlug>/<groupId>/<ts>-<name>`
 * via Supabase Storage. The DB row stores the resolved public URL and the
 * storage path so we can delete later.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { id } = await ctx.params;
    const session = await getSessionFromCookie();
    const access = await assertGroupAccess(id, session);
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const form = await req.formData();
    const file = form.get("file");
    const titleField = form.get("title");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "חסר קובץ" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ ok: false, error: "הקובץ ריק" }, { status: 400 });
    }
    if (file.size > TASK_FILE_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `קובץ גדול מדי — מקסימום ${Math.floor(TASK_FILE_MAX_BYTES / 1024 / 1024)} MB`,
        },
        { status: 413 },
      );
    }
    const mime = file.type || "application/octet-stream";
    if (!isAllowedTaskFileMime(mime)) {
      return NextResponse.json(
        {
          ok: false,
          error: `סוג קובץ אינו נתמך: ${mime}`,
          accepted: TASK_FILE_ALLOWED_MIME,
        },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || `upload-${Date.now()}`;
    const title = (typeof titleField === "string" && titleField.trim()) || fileName;

    const upload = await uploadTaskFile({
      buffer,
      fileName,
      contentType: mime,
      groupId: id,
    });
    if (!upload) {
      return NextResponse.json(
        { ok: false, error: "Supabase Storage לא מוגדר — לא ניתן להעלות קבצים" },
        { status: 503 },
      );
    }

    const session2 = session!;
    const row = await prismaAny.taskFile.create({
      data: {
        groupId: id,
        title,
        fileUrl: upload.url,
        fileName,
        fileType: mime,
        sizeBytes: file.size,
        storagePath: upload.path,
        uploadedById: session2.sub,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    // Touch the group's updatedAt so list views reflect activity ordering.
    await prismaAny.taskGroup.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true, data: serializeTaskFile(row) });
  } catch (e) {
    console.error("[POST /api/task-groups/:id/files]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
