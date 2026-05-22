import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { canManageAllTasks, isSuperAdmin } from "@/lib/tasks/task-access";
import { loadEmployeeWorkDay } from "@/lib/work-tasks/employee-work-service";
import {
  cleanUnusedTaskLibrary,
  deleteAllGroupsForEmployeeDay,
  resetEmployeeWorkDay,
  stopActiveTimersForEmployeeDay,
} from "@/lib/work-tasks/employee-work-admin";

export const dynamic = "force-dynamic";

type Action =
  | "delete_all_groups"
  | "reset_day"
  | "clean_library"
  | "stop_timers";

/** POST — פעולות ניהול (SUPER_ADMIN בלבד לפעולות הרסניות) */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ ok: false, error: "רק מנהל על יכול לבצע פעולה זו" }, { status: 403 });
  }

  const body = (await req.json()) as {
    action?: Action;
    employeeId?: string;
    date?: string;
  };

  const action = body.action;
  const employeeId = String(body.employeeId ?? "").trim();
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const actorUserId = strictUserId(session);

  try {
    if (action === "clean_library") {
      const meta = await cleanUnusedTaskLibrary({ actorUserId });
      return NextResponse.json({ ok: true, meta });
    }

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "חובה employeeId" }, { status: 400 });
    }

    let meta: Record<string, unknown> = {};
    if (action === "delete_all_groups") {
      meta = await deleteAllGroupsForEmployeeDay({ employeeId, workDateStr: date, actorUserId });
    } else if (action === "reset_day") {
      meta = await resetEmployeeWorkDay({ employeeId, workDateStr: date, actorUserId });
    } else if (action === "stop_timers") {
      meta = await stopActiveTimersForEmployeeDay({ employeeId, workDateStr: date, actorUserId });
    } else {
      return NextResponse.json({ ok: false, error: "פעולה לא נתמכת" }, { status: 400 });
    }

    const data = await loadEmployeeWorkDay(employeeId, date);
    return NextResponse.json({ ok: true, meta, data });
  } catch (e) {
    console.error("[POST employee-work actions]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
