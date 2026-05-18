import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { resolveEmployeeIdForUser } from "@/lib/work-tasks/access";
import { serializeWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

export const dynamic = "force-dynamic";

/**
 * GET /api/work/my-tasks
 * רק משימות עם employeeId של המשתמש המחובר (כרטיס Employee מקושר).
 */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const eid = await resolveEmployeeIdForUser(session.sub);
    if (!eid) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const rows = await prisma.employeeTask.findMany({
      where: { employeeId: eid },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      data: rows.map(serializeWorkEmployeeTask),
    });
  } catch (e) {
    console.error("[GET /api/work/my-tasks]", e);
    return NextResponse.json({ ok: false, error: "שגיאה בטעינת משימות" }, { status: 500 });
  }
}
