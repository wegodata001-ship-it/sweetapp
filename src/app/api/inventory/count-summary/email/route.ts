import { after, NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { canViewCountSummary } from "@/lib/inventory/count-access";
import {
  daySpanRange,
  loadInventoryReportRange,
} from "@/lib/inventory/daily-count-report";
import { inventoryCountSummaryFileName } from "@/lib/inventory/daily-count-report-pdf";
import { resolveSummaryRange } from "@/lib/inventory/count-summary-range";
import { ACTIVE_SESSION_WHERE } from "@/lib/inventory/count-session-status";
import {
  buildReportAttachments,
  buildReportEmailData,
  reportPeriodLabel,
} from "@/lib/inventory/count-summary-mail";
import { reportSystemFailureAsync } from "@/lib/notifications/system-alert-dispatch";

/**
 * POST — שליחת סיכום ספירות לכל כתובת מייל, עם PDF ו־Excel מצורפים.
 *
 * מסלול קריאה בלבד מבחינת נתוני הספירה: הדוח מופק מהנתונים הקיימים ואינו
 * משנה סבבי ספירה, סשנים או שורות.
 *
 * הפקת המסמכים והשליחה רצות ב־after() אחרי שהתשובה כבר נשלחה: על טווח חודשי
 * מלא ההפקה נמשכת כמה שניות, ואין סיבה להחזיק את המשתמש. התוצאה נרשמת
 * ל־ActivityLog ול־EmailLog בסיום, כך שהכשלים אינם נבלעים.
 */

const MAX_RECIPIENTS = 10;
const DEFAULT_SUBJECT = "סיכום ספירות מלאי";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** קלט של כתובת אחת או רשימה מופרדת בפסיק/נקודה-פסיק */
function parseRecipients(raw: unknown): { emails: string[]; invalid: string[] } {
  const parts = String(raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const email = part.toLowerCase();
    if (!EMAIL_RE.test(email)) invalid.push(part);
    else if (!emails.includes(email)) emails.push(email);
  }
  return { emails, invalid };
}

const PRESET_AUDIT_LABEL: Record<string, string> = {
  today: "day",
  week: "week",
  month: "month",
  custom: "custom",
};

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canViewCountSummary(session.role)) {
    return NextResponse.json(
      { ok: false, error: "רק מנהל מערכת או בעל העסק יכולים לשלוח סיכומי ספירות" },
      { status: 403 },
    );
  }

  let body: {
    to?: unknown;
    subject?: unknown;
    preset?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const { emails, invalid } = parseRecipients(body.to);
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: `כתובת מייל לא תקינה: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }
  if (emails.length === 0) {
    return NextResponse.json({ ok: false, error: "יש להזין כתובת מייל" }, { status: 400 });
  }
  if (emails.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { ok: false, error: `ניתן לשלוח עד ${MAX_RECIPIENTS} נמענים בבת אחת` },
      { status: 400 },
    );
  }

  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim().slice(0, 200)
      : DEFAULT_SUBJECT;

  const range = resolveSummaryRange({
    preset: typeof body.preset === "string" ? body.preset : null,
    from: typeof body.dateFrom === "string" ? body.dateFrom : null,
    to: typeof body.dateTo === "string" ? body.dateTo : null,
  });
  const reportType = PRESET_AUDIT_LABEL[range.preset] ?? range.preset;

  const auditBase = `to=${emails.join(",")} reportType=${reportType} from=${range.from} to=${range.to}`;

  // בדיקה זולה לפני שמחזירים "נשלח": אין טעם להפיק דוח ריק
  let sessionsInRange: number;
  try {
    const span = daySpanRange(range.from, range.to);
    sessionsInRange = (await prismaAny.inventoryCountSession.count({
      where: { createdAt: { gte: span.start, lt: span.end }, ...ACTIVE_SESSION_WHERE },
    })) as number;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
  if (sessionsInRange === 0) {
    return NextResponse.json(
      { ok: false, error: "לא בוצעו ספירות בתקופה שנבחרה" },
      { status: 400 },
    );
  }

  after(() => sendSummary({ emails, subject, range, reportType, auditBase, userId: session.sub }));

  return NextResponse.json({
    ok: true,
    data: {
      queued: true,
      recipients: emails,
      preset: range.preset,
      from: range.from,
      to: range.to,
      sessionCount: sessionsInRange,
    },
  });
}

type SendSummaryArgs = {
  emails: string[];
  subject: string;
  range: ReturnType<typeof resolveSummaryRange>;
  reportType: string;
  auditBase: string;
  userId: string;
};

/** רץ אחרי שהתשובה נשלחה — אסור לו לזרוק */
async function sendSummary({
  emails,
  subject,
  range,
  reportType,
  auditBase,
  userId,
}: SendSummaryArgs): Promise<void> {
  try {
    const report = await loadInventoryReportRange(range.from, range.to);
    const periodLabel = reportPeriodLabel(report);
    const { attachments, names, failures } = await buildReportAttachments(
      report,
      (ext) => inventoryCountSummaryFileName(report, ext),
      "he",
    );
    for (const failure of failures) {
      void reportSystemFailureAsync({
        category: failure.kind === "pdf" ? "pdfFailure" : "systemCritical",
        title: `הפקת ${failure.kind === "pdf" ? "PDF" : "Excel"} לסיכום ספירות נכשלה`,
        message: `תקופה: ${range.from}..${range.to}\nשגיאה: ${failure.error}`,
        entityId: `${range.from}_${range.to}`,
      });
    }

    const sender = await prisma.user
      .findUnique({ where: { id: userId }, select: { fullName: true } })
      .catch(() => null);

    const data = buildReportEmailData(report, names, {
      periodLabel,
      headline: `${subject} — ${periodLabel}`,
      intro: `שלום,\nמצורף סיכום ספירות המלאי. תקופת הדוח: ${periodLabel}.`,
    });

    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const email of emails) {
      const res = await sendSystemEmailAwaitable({
        to: email,
        subject: `${subject} — ${periodLabel}`,
        template: "inventory-daily-report",
        type: "INVENTORY_COUNT_SUMMARY",
        // שליחה יזומה: המשתמש ביקש במפורש לשלוח, ולכן אין לחסום כפילות
        skipDedupe: true,
        data: {
          ...data,
          reportType,
          sentById: userId,
          sentByName: sender?.fullName ?? "",
        },
        attachments,
      });
      results.push({ email, ok: res.ok, error: res.ok ? undefined : res.error });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    await logActivity(
      userId,
      `inventory_count_summary_email ${auditBase} sessions=${report.sessionCount} sent=${sent} failed=${failed}` +
        (failed > 0
          ? ` error=${results
              .filter((r) => !r.ok)
              .map((r) => `${r.email}: ${r.error ?? "unknown"}`)
              .join("; ")}`
          : ""),
    );

    if (failed > 0) {
      // המשתמש כבר קיבל אישור — הכשל חייב להגיע למישהו
      void reportSystemFailureAsync({
        category: "emailFailure",
        title: "שליחת סיכום ספירות במייל נכשלה",
        message: `תקופה: ${range.from}..${range.to}\n${results
          .filter((r) => !r.ok)
          .map((r) => `${r.email}: ${r.error ?? "unknown"}`)
          .join("\n")}`,
        entityId: `${range.from}_${range.to}`,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה";
    await logActivity(userId, `inventory_count_summary_email ${auditBase} failed error=${message}`);
    void reportSystemFailureAsync({
      category: "emailFailure",
      title: "הפקת סיכום ספירות לשליחה נכשלה",
      message: `תקופה: ${range.from}..${range.to}\nשגיאה: ${message}`,
      entityId: `${range.from}_${range.to}`,
    });
  }
}
