import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { retryFailedNotificationEmails } from "@/lib/email/retry-failed-emails";

export const dynamic = "force-dynamic";

export async function POST() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const retried = await retryFailedNotificationEmails(80);
  return NextResponse.json({ ok: true, retried });
}
