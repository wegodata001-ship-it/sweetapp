import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import { logStrictScope, strictUserId } from "@/lib/auth/strict-user-isolation";
import { queryEmployeeDashboard } from "@/lib/me/employee-dashboard-read";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/dashboard — פורטל עובד בלבד.
 * אין employeeId. רק userId = session.sub.
 */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const uid = strictUserId(session);

  try {
    const closedShifts = await enforceMaxShiftLength({ userId: uid });
    const autoClosed = closedShifts.some((row) => row.userId === uid);
    const snap = await queryEmployeeDashboard(uid);

    logStrictScope("[GET /api/me/dashboard]", session, {
      returnedRuns: snap.data.counts.active_runs,
      dbQueries: snap.dbQueries,
      dbMs: Math.round(snap.dbMs),
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...snap.data,
        auto_closed: autoClosed,
      },
    });
  } catch (e) {
    console.error("[GET /api/me/dashboard]", e);
    return NextResponse.json(
      { ok: false, error: "שגיאה בטעינת לוח הבית" },
      { status: 500 },
    );
  }
}
