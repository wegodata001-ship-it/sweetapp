import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { touchUserPresence } from "@/lib/work-status/active-task";

export const dynamic = "force-dynamic";

export async function POST() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  try {
    await touchUserPresence(strictUserId(session));
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    console.error("[POST /api/work-status/heartbeat]", e);
    return NextResponse.json({ ok: false, error: "שגיאה" }, { status: 500 });
  }
}
