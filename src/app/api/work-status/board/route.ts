import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { loadWorkStatusBoard, type WorkBoardQueryTimings } from "@/lib/work-status/board-service";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

export const dynamic = "force-dynamic";

/** When this route module was first loaded in the current server process. */
const routeModuleLoadedAt = Date.now();

function timingHeader(parts: Array<[string, number]>): string {
  return parts.map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(ms))}`).join(", ");
}

export async function GET() {
  const serverStarted = performance.now();
  const block = await requireDb();
  if (block) return block;
  const authStarted = performance.now();
  const session = await getSessionFromCookie();
  const authMs = performance.now() - authStarted;
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  try {
    const enforceStarted = performance.now();
    await enforceMaxShiftLength();
    const enforceMs = performance.now() - enforceStarted;
    const queryTimings: WorkBoardQueryTimings = { userMs: 0, timelineMs: 0, groupMs: 0 };
    const rows = await loadWorkStatusBoard(queryTimings);
    const online = rows.filter((r) => r.presence !== "OFFLINE").length;
    const working = rows.filter((r) => r.presence === "WORKING" || r.presence === "LATE").length;
    const serializeStarted = performance.now();
    const body = {
      ok: true,
      data: { rows, stats: { total: rows.length, online, working } },
    };
    const serializeMs = performance.now() - serializeStarted;
    const totalMs = performance.now() - serverStarted;
    const response = NextResponse.json(body);
    response.headers.set(
      "Server-Timing",
      timingHeader([
        ["auth", authMs],
        ["enforce", enforceMs],
        ["user", queryTimings.userMs],
        ["timeline", queryTimings.timelineMs],
        ["groups", queryTimings.groupMs],
        ["serialize", serializeMs],
        ["processAge", Date.now() - routeModuleLoadedAt],
        ["total", totalMs],
      ]),
    );
    return response;
  } catch (e) {
    console.error("[GET /api/work-status/board]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
