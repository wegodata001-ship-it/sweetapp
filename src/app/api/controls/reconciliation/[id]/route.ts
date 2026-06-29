import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { loadImportDetail } from "@/lib/controls/reconciliation-load";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const detail = await loadImportDetail(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "ייבוא לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: detail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
