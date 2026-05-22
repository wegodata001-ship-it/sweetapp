import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { searchTaskTemplates } from "@/lib/work-tasks/task-template-library";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/work-library?q=
 * רשימת TaskTemplate (ספריית משימות) + חיפוש חכם.
 */
export async function GET(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const rows = await searchTaskTemplates(q, q.trim() ? 20 : 500);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    console.error("[GET /api/admin/work-library]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}

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
    estimatedMinutes?: number;
    orderIndex?: number;
  };
  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "חובה כותרת" }, { status: 400 });
  }
  const estimatedMinutes =
    typeof body.estimatedMinutes === "number" && body.estimatedMinutes > 0
      ? Math.round(body.estimatedMinutes)
      : 15;
  try {
    const row = await prisma.taskTemplate.create({
      data: {
        title,
        description: body.description?.trim() || null,
        estimatedMinutes,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : 0,
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[POST /api/admin/work-library]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}
