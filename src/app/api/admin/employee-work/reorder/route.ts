import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { reorderEmployeeGroups, reorderEmployeeTasks } from "@/lib/work-tasks/employee-work-service";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const body = (await req.json()) as {
    orderedIds?: string[];
    orderedGroupIds?: string[];
    scope?: "tasks" | "groups";
    employeeId?: string;
    date?: string;
  };
  const ids = body.orderedIds ?? [];
  const groupIds = body.orderedGroupIds ?? [];
  if (body.scope === "groups") {
    if (groupIds.length === 0) {
      return NextResponse.json({ ok: false, error: "חובה orderedGroupIds" }, { status: 400 });
    }
    try {
      await reorderEmployeeGroups(groupIds);
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[PATCH employee-work reorder groups]", e);
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
        { status: 500 },
      );
    }
  }
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "חובה orderedIds" }, { status: 400 });
  }
  try {
    await reorderEmployeeTasks(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH employee-work reorder]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
