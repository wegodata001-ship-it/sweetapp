import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { resendEmailFromLog } from "@/lib/email/send";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

/** POST — שליחה מחדש */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session || !isManagerRole(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const result = await resendEmailFromLog(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "שליחה נכשלה" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
