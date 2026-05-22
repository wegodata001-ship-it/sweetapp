import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  duplicateTaskGroup,
  TaskGroupServiceError,
} from "@/lib/workflows/task-group-service";
import { serializeWorkflowTemplateDetail } from "@/lib/workflows/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/templates/:id/duplicate
 * Manager-only — שכפול קבוצת משימות (תבנית) עם כל הפריטים, בלי ריצות/טיימרים.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  try {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const created = await duplicateTaskGroup({
      sourceTemplateId: id,
      createdById: session.sub,
    });
    type Row = Parameters<typeof serializeWorkflowTemplateDetail>[0];
    return NextResponse.json({
      ok: true,
      data: serializeWorkflowTemplateDetail(created as unknown as Row),
    });
  } catch (e) {
    if (e instanceof TaskGroupServiceError) {
      const status = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status });
    }
    console.error("[POST /api/workflows/templates/:id/duplicate]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בשכפול" },
      { status: 500 },
    );
  }
}
