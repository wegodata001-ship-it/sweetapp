import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  try {
    const rows = await prisma.workTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { taskTemplate: true },
        },
      },
      take: 200,
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    console.error("[GET /api/admin/work-templates]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}

type ItemIn = { taskTemplateId: string; orderIndex?: number };

export async function POST(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    items?: ItemIn[];
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "חובה שם תבנית" }, { status: 400 });
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "חובה לפחות משימה אחת בתבנית" }, { status: 400 });
  }

  try {
    const tpl = await prisma.workTemplate.create({
      data: {
        title,
        description: body.description?.trim() || null,
        tasks: {
          create: items.map((it, i) => ({
            taskTemplateId: String(it.taskTemplateId).trim(),
            orderIndex: typeof it.orderIndex === "number" ? it.orderIndex : i,
          })),
        },
      },
      include: {
        tasks: { orderBy: { orderIndex: "asc" }, include: { taskTemplate: true } },
      },
    });
    return NextResponse.json({ ok: true, data: tpl });
  } catch (e) {
    console.error("[POST /api/admin/work-templates]", e);
    return NextResponse.json(
      { ok: false, error: "לא ניתן ליצור — ודאו שכל מזהי המשימות בספריה קיימים" },
      { status: 400 },
    );
  }
}
