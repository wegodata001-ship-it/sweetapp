import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { getCountSessionDetail } from "@/lib/inventory/count-session-service";

/** GET — פרטי ספירה מלאים (קריאה בלבד / PDF) */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const detail = await getCountSessionDetail(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "ספירה לא נמצאה" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: detail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
