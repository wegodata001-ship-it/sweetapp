import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export const dynamic = "force-dynamic";

type ItemIn = { taskTemplateId: string; orderIndex?: number };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const row = await prisma.workTemplate.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { orderIndex: "asc" }, include: { taskTemplate: true } },
      },
    });
    if (!row) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[GET /api/admin/work-templates/:id]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}

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
    items?: ItemIn[];
  };

  try {
    const data: { title?: string; description?: string | null } = {};
    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ ok: false, error: "שם ריק" }, { status: 400 });
      data.title = t;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;

    if (body.items !== undefined) {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return NextResponse.json({ ok: false, error: "חובה לפחות משימה אחת" }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.workTemplateTask.deleteMany({ where: { templateId: id } });
        await tx.workTemplateTask.createMany({
          data: items.map((it, i) => ({
            templateId: id,
            taskTemplateId: String(it.taskTemplateId).trim(),
            orderIndex: typeof it.orderIndex === "number" ? it.orderIndex : i,
          })),
        });
        if (Object.keys(data).length) {
          await tx.workTemplate.update({ where: { id }, data });
        }
      });
    } else if (Object.keys(data).length) {
      await prisma.workTemplate.update({ where: { id }, data });
    }

    if (body.items === undefined && Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }

    const row = await prisma.workTemplate.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { orderIndex: "asc" }, include: { taskTemplate: true } },
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[PATCH /api/admin/work-templates/:id]", e);
    return NextResponse.json({ ok: false, error: "עדכון נכשל" }, { status: 400 });
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
    await prisma.workTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }
}
