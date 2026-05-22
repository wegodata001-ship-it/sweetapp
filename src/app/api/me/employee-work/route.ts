import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { strictUserId } from "@/lib/tasks/task-access";
import { loadEmployeeWorkDay } from "@/lib/work-tasks/employee-work-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET — סדר העבודה של העובד המחובר בלבד */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const uid = strictUserId(session);
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { employeeId: true },
  });
  if (!user?.employeeId) {
    return NextResponse.json({ ok: false, error: "אין כרטיס עובד מקושר" }, { status: 403 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  try {
    const data = await loadEmployeeWorkDay(user.employeeId, date);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[GET /api/me/employee-work]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
