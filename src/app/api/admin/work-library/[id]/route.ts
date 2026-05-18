import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    estimatedMinutes?: number;
    isActive?: boolean;
    orderIndex?: number;
  };
  try {
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ ok: false, error: "כותרת ריקה" }, { status: 400 });
      data.title = t;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.estimatedMinutes !== undefined) {
      const n = Math.round(Number(body.estimatedMinutes));
      if (n > 0) data.estimatedMinutes = n;
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.orderIndex !== undefined) data.orderIndex = Math.round(Number(body.orderIndex));
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות" }, { status: 400 });
    }
    const row = await prisma.taskTemplate.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: row });
  } catch {
    return NextResponse.json({ ok: false, error: "לא נמצא או לא ניתן לעדכן" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await prisma.taskTemplate.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }
}
