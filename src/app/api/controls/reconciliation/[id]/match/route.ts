import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { runReconciliation } from "@/lib/controls/reconciliation-match";
import { loadImportDetail } from "@/lib/controls/reconciliation-load";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await runReconciliation(id);
    const detail = await loadImportDetail(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "ייבוא לא נמצא" }, { status: 404 });
    }
    await logActivity(session.sub, `ביצוע התאמת מערכות — ${detail.import.weekCode}`);
    return NextResponse.json({ ok: true, data: detail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בהתאמה" },
      { status: 500 },
    );
  }
}
