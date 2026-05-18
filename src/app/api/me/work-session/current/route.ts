import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/work-session/current
 *
 * Returns the caller's currently-active work session (if any) plus a tiny
 * "today" summary so the employee dashboard can render hours-worked-today
 * without a second request.
 */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const active = await prismaAny.workSession.findFirst({
      where: { userId: session.sub, status: "ACTIVE" },
      orderBy: { clockIn: "desc" },
    });

    // Sum today's completed sessions to surface a "minutes worked today" KPI.
    // We compute "today" using UTC midnight of the row's workDate so the
    // server timezone never shifts the answer.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayRows = await prismaAny.workSession.findMany({
      where: {
        userId: session.sub,
        workDate: { gte: startOfDay, lt: tomorrow },
      },
      select: { id: true, status: true, totalMinutes: true, clockIn: true, clockOut: true },
    });

    const completedMinutes = todayRows
      .filter((r: { status: string }) => r.status === "ENDED")
      .reduce((acc: number, r: { totalMinutes: number | null }) => acc + (r.totalMinutes ?? 0), 0);

    return NextResponse.json({
      ok: true,
      data: {
        session: active ? serializeWorkSession(active) : null,
        today: {
          completed_minutes: completedMinutes,
          sessions_count: todayRows.length,
        },
      },
    });
  } catch (e) {
    console.error("[GET /api/me/work-session/current]", e);
    return NextResponse.json(
      { ok: false, error: "שגיאה בטעינת מצב העבודה" },
      { status: 500 },
    );
  }
}
