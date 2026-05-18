import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  serializeWorkSession,
  type WorkSessionDto,
} from "@/lib/work-sessions/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/work-session/history
 *
 * Returns the caller's recent work sessions grouped by day.
 *
 * Query params:
 *  - days  (default 14): how many calendar days back to return
 *  - limit (default 200): hard cap on number of sessions returned
 */
export async function GET(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days") ?? "14") || 14));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200));

  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const rows = await prismaAny.workSession.findMany({
      where: {
        userId: session.sub,
        workDate: { gte: start },
      },
      orderBy: [{ workDate: "desc" }, { clockIn: "desc" }],
      take: limit,
    });

    const sessions: WorkSessionDto[] = rows.map(serializeWorkSession);

    // Group by work_date for easy table rendering.
    type DayGroup = {
      work_date: string;
      sessions: typeof sessions;
      total_minutes: number;
      first_in: string | null;
      last_out: string | null;
    };
    const byDay = new Map<string, DayGroup>();
    for (const s of sessions) {
      const key = s.work_date;
      const existing = byDay.get(key);
      if (existing) {
        existing.sessions.push(s);
      } else {
        byDay.set(key, {
          work_date: key,
          sessions: [s],
          total_minutes: 0,
          first_in: null,
          last_out: null,
        });
      }
    }
    for (const grp of byDay.values()) {
      grp.sessions.sort((a, b) => (a.clock_in < b.clock_in ? -1 : 1));
      grp.first_in = grp.sessions[0]?.clock_in ?? null;
      grp.total_minutes = grp.sessions.reduce(
        (acc: number, s) => acc + (s.status === "ENDED" ? s.total_minutes ?? 0 : 0),
        0,
      );
      const lastEnded = [...grp.sessions].reverse().find((s) => s.clock_out);
      grp.last_out = lastEnded?.clock_out ?? null;
    }

    const days_out = [...byDay.values()].sort((a, b) => (a.work_date < b.work_date ? 1 : -1));

    return NextResponse.json({ ok: true, data: { days: days_out } });
  } catch (e) {
    console.error("[GET /api/me/work-session/history]", e);
    return NextResponse.json(
      { ok: false, error: "שגיאה בטעינת היסטוריה" },
      { status: 500 },
    );
  }
}
