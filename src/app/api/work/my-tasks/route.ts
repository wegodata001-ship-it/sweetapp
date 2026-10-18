import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logStrictScope, strictUserId } from "@/lib/auth/strict-user-isolation";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";
import {
  decodeTaskPageCursor,
  loadMyTasksSnapshot,
  queryMyTasksPage,
  type TaskPageScope,
} from "@/lib/work-tasks/my-tasks-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/work/my-tasks
 * One snapshot for the employee tasks screen: open tasks + today's completed,
 * active shift, and today minutes. No user/employee joins. No 500-row history.
 */
function pageScope(raw: string | null): TaskPageScope | null {
  if (raw === "open" || raw === "completed") return raw;
  return null;
}

export async function GET(req: NextRequest) {
  const started = performance.now();
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const authStarted = performance.now();
  const session = await getSessionFromCookie();
  const authMs = performance.now() - authStarted;
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const uid = strictUserId(session);
  const scope = pageScope(req.nextUrl.searchParams.get("scope"));
  const cursor = decodeTaskPageCursor(req.nextUrl.searchParams.get("cursor"));

  try {
    if (scope) {
      const enforceStarted = performance.now();
      if (session.role === "EMPLOYEE") {
        await enforceMaxShiftLength({ userId: uid });
      }
      const enforceMs = performance.now() - enforceStarted;
      const page = await queryMyTasksPage({ userId: uid, scope, cursor });
      logStrictScope("[GET /api/work/my-tasks]", session, {
        scope,
        returnedTasks: page.tasks.length,
        total: page.total,
      });
      const response = NextResponse.json({
        ok: true,
        scope,
        tasks: page.tasks,
        total: page.total,
        next_cursor: page.next_cursor,
      });
      response.headers.set(
        "Server-Timing",
        `auth;dur=${Math.round(authMs)}, enforce;dur=${Math.round(enforceMs)}, query;dur=${Math.round(page.dbMs)}, total;dur=${Math.round(performance.now() - started)}`,
      );
      return response;
    }

    const snap = await loadMyTasksSnapshot({ userId: uid, role: session.role });

    logStrictScope("[GET /api/work/my-tasks]", session, {
      returnedTasks: snap.tasks.length,
      returnedTaskIds: snap.tasks.map((t) => t.id),
      returnedAssignees: snap.tasks.map(() => uid),
    });

    const response = NextResponse.json({
      ok: true,
      data: snap.tasks,
      open: snap.open,
      completed: snap.completed,
      totals: snap.totals,
      stats: snap.stats,
      shift: snap.shift,
      today: snap.today,
      auto_closed: snap.auto_closed,
      shift_open: snap.shift_open,
    });
    response.headers.set(
      "Server-Timing",
      `auth;dur=${Math.round(authMs)}, enforce;dur=${Math.round(snap.enforceMs)}, query;dur=${Math.round(snap.dbMs)}, total;dur=${Math.round(performance.now() - started)}`,
    );
    return response;
  } catch (e) {
    console.error("[GET /api/work/my-tasks]", e);
    return NextResponse.json({ ok: false, error: "שגיאה בטעינת משימות" }, { status: 500 });
  }
}
