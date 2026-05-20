import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { assertTestRecipient } from "@/lib/email/test-config";
import { buildTestEmailPayload, type EmailTestType } from "@/lib/email/test-email";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>([
  "SIMPLE",
  "OCR_WORDS",
  "TASK_ASSIGNED",
  "TASK_COMPLETED",
  "SHIFT_LATE",
  "NEW_UPDATE",
]);

function isAuthorized(req: NextRequest, session: Awaited<ReturnType<typeof getSessionFromCookie>>): boolean {
  if (session && (session.role === "SUPER_ADMIN" || isManagerRole(session.role))) {
    return true;
  }
  const key =
    req.headers.get("x-email-test-key")?.trim() ||
    req.nextUrl.searchParams.get("key")?.trim() ||
    "";
  const secret = process.env.EMAIL_TEST_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  return Boolean(key && secret && key === secret);
}

/**
 * POST /api/debug/test-email
 * Body: { "email": "abulieltasneem23@gmail.com", "type": "TASK_ASSIGNED" | "SIMPLE" | ... }
 */
export async function POST(req: NextRequest) {
  console.log("[EMAIL TEST START]");

  const dbErr = await requireDb();
  if (dbErr) {
    console.log("[EMAIL TEST FAILED]", "database");
    return dbErr;
  }

  const session = await getSessionFromCookie();
  if (!isAuthorized(req, session)) {
    console.log("[EMAIL TEST FAILED]", "unauthorized");
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  let body: { email?: string; type?: string };
  try {
    body = (await req.json()) as { email?: string; type?: string };
  } catch {
    console.log("[EMAIL TEST FAILED]", "invalid json");
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const rawEmail = String(body.email ?? "").trim();
  const typeRaw = String(body.type ?? "SIMPLE").trim().toUpperCase();

  if (!rawEmail) {
    console.log("[EMAIL TEST FAILED]", "missing email");
    return NextResponse.json({ ok: false, error: "חובה email" }, { status: 400 });
  }

  let recipient: string;
  try {
    recipient = assertTestRecipient(rawEmail);
  } catch (e) {
    console.log("[EMAIL TEST FAILED]", String(e));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }

  const type = (VALID_TYPES.has(typeRaw) ? typeRaw : "SIMPLE") as EmailTestType;
  const payload = buildTestEmailPayload(type, recipient);

  const result = await sendSystemEmailAwaitable(payload);

  let logRow: { id: string; status: string; recipient: string } | null = null;
  if (result.logId) {
    try {
      logRow = (await prismaAny.emailLog.findUnique({
        where: { id: result.logId },
        select: { id: true, status: true, recipient: true },
      })) as { id: string; status: string; recipient: string } | null;
    } catch {
      logRow = null;
    }
  }

  if (!result.ok) {
    console.log("[EMAIL TEST FAILED]", result.error);
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "שליחה נכשלה",
        data: { recipient, type, log: logRow },
      },
      { status: 502 },
    );
  }

  console.log("[EMAIL TEST SUCCESS]", { recipient, type, logId: result.logId, resendId: result.resendId });

  return NextResponse.json({
    ok: true,
    data: {
      recipient,
      type,
      subject: payload.subject,
      template: payload.template,
      resendId: result.resendId,
      emailLog: logRow,
    },
  });
}
