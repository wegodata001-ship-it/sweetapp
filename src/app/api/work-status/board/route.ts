import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { loadWorkStatusBoard } from "@/lib/work-status/board-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  try {
    const rows = await loadWorkStatusBoard();
    const online = rows.filter((r) => r.presence !== "OFFLINE").length;
    const working = rows.filter((r) => r.presence === "WORKING" || r.presence === "LATE").length;
    return NextResponse.json({
      ok: true,
      data: { rows, stats: { total: rows.length, online, working } },
    });
  } catch (e) {
    console.error("[GET /api/work-status/board]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
