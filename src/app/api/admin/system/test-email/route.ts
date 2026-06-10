import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { getEmailDiagnostics } from "@/lib/email/diagnostics";
import { resolveOutboundEmail } from "@/lib/email/test-config";
import { getEmailConfig } from "@/lib/email/config";
import { prismaAny } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — שליחת מייל בדיקה למשתמש המחובר */
export async function POST() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const user = await prismaAny.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, fullName: true },
  });
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "לא נמצא אימייל למשתמש" }, { status: 400 });
  }

  const to = resolveOutboundEmail(user.email);
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "כתובת המייל של המשתמש אינה ניתנת לשליחה" },
      { status: 400 },
    );
  }

  const diagnostics = getEmailDiagnostics();
  if (!diagnostics.configured) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY חסר", diagnostics },
      { status: 503 },
    );
  }

  const { appUrl } = getEmailConfig();
  const result = await sendSystemEmailAwaitable({
    to,
    subject: "מייל בדיקה — WEGO ERP",
    template: "test-simple",
    type: "SYSTEM_TEST",
    userId: user.id,
    skipDedupe: true,
    data: {
      appUrl,
      recipientName: user.fullName,
      sentAt: new Date().toLocaleString("he-IL"),
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "שליחה נכשלה",
        diagnostics,
        to,
        logId: result.logId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    to,
    resendId: result.resendId,
    logId: result.logId,
    diagnostics,
  });
}
