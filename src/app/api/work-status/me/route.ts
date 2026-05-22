import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { loadWorkStatusMe } from "@/lib/work-status/board-service";
import { touchUserPresence } from "@/lib/work-status/active-task";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const uid = strictUserId(session);
  try {
    await touchUserPresence(uid);
    const data = await loadWorkStatusMe(uid);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[GET /api/work-status/me]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
