/**
 * שליחת דוח סיכום הספירות היומי.
 *
 * הדוח נשלח רק אם בוצעה לפחות ספירה אחת באותו יום, ורק דוח אחד ליום:
 * שורת InventoryDailyReportRun עם reportDay ייחודי היא גם מנעול הכפילות וגם
 * יומן הריצות. ריצה שנכשלה נשארת בסטטוס FAILED/PARTIAL ולכן ההרצה הבאה של
 * ה־cron מנסה אותה שוב (Retry) — בלי לשלוח שוב דוח שכבר נשלח בהצלחה.
 */
import { prismaAny } from "@/lib/prisma";
import {
  reportSystemFailure,
  sendSystemAlertToRecipients,
} from "@/lib/notifications/system-alert-dispatch";
import { resolveRecipientsForCategory } from "@/lib/notifications/system-recipients";
import {
  loadInventoryDailyReport,
  localDay,
  normalizeReportDay,
} from "@/lib/inventory/daily-count-report";
import { inventoryDailyReportFileName } from "@/lib/inventory/daily-count-report-pdf";
import {
  buildReportAttachments,
  buildReportEmailData,
  fmtReportDate,
} from "@/lib/inventory/count-summary-mail";

export type DailyReportRunStatus =
  | "SENT"
  | "PARTIAL"
  | "FAILED"
  | "NO_SESSIONS"
  | "NO_RECIPIENTS"
  | "ALREADY_SENT";

export type DailyReportJobResult = {
  ok: boolean;
  day: string;
  status: DailyReportRunStatus;
  sessionCount: number;
  recipientCount: number;
  sent: number;
  failed: number;
  deduped: number;
  attempts: number;
  attachments: string[];
  error?: string;
};

export type DailyReportJobOptions = {
  /** YYYY-MM-DD. ברירת מחדל: היום. */
  day?: string | null;
  /** נסיגה בימים — לשימוש כשה־cron רץ אחרי חצות ומסכם את היום שקדם. */
  offsetDays?: number;
  /** שליחה חוזרת יזומה גם אם הדוח כבר נשלח */
  force?: boolean;
  /** שפת המסמך. ברירת מחדל עברית. */
  language?: string | null;
};

function resolveDay(options: DailyReportJobOptions): string {
  if (options.day?.trim()) return normalizeReportDay(options.day);
  const offset = Number.isFinite(options.offsetDays) ? Number(options.offsetDays) : 0;
  const base = new Date();
  if (offset) base.setDate(base.getDate() - offset);
  return localDay(base);
}

async function upsertRun(
  day: string,
  patch: Record<string, unknown>,
): Promise<{ attempts: number }> {
  const row = (await prismaAny.inventoryDailyReportRun.upsert({
    where: { reportDay: day },
    create: { reportDay: day, attempts: 1, ...patch },
    update: { attempts: { increment: 1 }, ...patch },
    select: { attempts: true },
  })) as { attempts: number };
  return row;
}

async function finishRun(day: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await prismaAny.inventoryDailyReportRun.update({
      where: { reportDay: day },
      data: { finishedAt: new Date(), ...patch },
    });
  } catch {
    // עדכון היומן לא אמור להפיל את הריצה
  }
}

export async function runInventoryDailyReportJob(
  options: DailyReportJobOptions = {},
): Promise<DailyReportJobResult> {
  const day = resolveDay(options);
  const base: DailyReportJobResult = {
    ok: true,
    day,
    status: "SENT",
    sessionCount: 0,
    recipientCount: 0,
    sent: 0,
    failed: 0,
    deduped: 0,
    attempts: 0,
    attachments: [],
  };

  const existing = (await prismaAny.inventoryDailyReportRun.findUnique({
    where: { reportDay: day },
    select: { status: true, attempts: true, sentCount: true, sessionCount: true },
  })) as
    | { status: string; attempts: number; sentCount: number; sessionCount: number }
    | null;

  if (!options.force && existing?.status === "SENT") {
    return {
      ...base,
      status: "ALREADY_SENT",
      attempts: existing.attempts,
      sessionCount: existing.sessionCount,
      sent: existing.sentCount,
    };
  }

  const run = await upsertRun(day, { status: "PENDING", startedAt: new Date(), error: null });
  base.attempts = run.attempts;

  try {
    const report = await loadInventoryDailyReport(day);
    base.sessionCount = report.sessionCount;

    if (report.sessionCount === 0) {
      await finishRun(day, { status: "NO_SESSIONS", sessionCount: 0 });
      return { ...base, status: "NO_SESSIONS" };
    }

    const recipients = await resolveRecipientsForCategory("inventoryDailyReport");
    base.recipientCount = recipients.length;
    if (recipients.length === 0) {
      await finishRun(day, {
        status: "NO_RECIPIENTS",
        sessionCount: report.sessionCount,
        recipientCount: 0,
      });
      return { ...base, status: "NO_RECIPIENTS" };
    }

    const { attachments, names, failures } = await buildReportAttachments(
      report,
      (ext) => inventoryDailyReportFileName(day, ext),
      options.language ?? "he",
    );
    // קובץ שנכשל לא מבטל את הדוח — הסיכום נשלח בכל מקרה, והתקלה מדווחת
    for (const failure of failures) {
      void reportSystemFailure({
        category: failure.kind === "pdf" ? "pdfFailure" : "systemCritical",
        title: `הפקת ${failure.kind === "pdf" ? "PDF" : "Excel"} לדוח ספירות יומי נכשלה`,
        message: `יום: ${day}\nשגיאה: ${failure.error}`,
        entityId: day,
      });
    }

    base.attachments = names;

    const alert = await sendSystemAlertToRecipients(
      {
        category: "inventoryDailyReport",
        subject: `📊 סיכום ספירות מלאי — ${fmtReportDate(day)}`,
        template: "inventory-daily-report",
        data: buildReportEmailData(report, base.attachments),
        logType: "INVENTORY_DAILY_REPORT",
        entityId: day,
        dedupeKey: `daily-report:${day}`,
        dedupeWindowHours: 20,
        skipDedupe: options.force === true,
        attachments,
      },
      recipients,
    );

    const status: DailyReportRunStatus =
      alert.sent > 0 && alert.failed === 0
        ? "SENT"
        : alert.sent > 0
          ? "PARTIAL"
          : alert.deduped > 0
            ? "SENT"
            : "FAILED";

    await finishRun(day, {
      status,
      sessionCount: report.sessionCount,
      recipientCount: alert.recipientCount,
      sentCount: alert.sent,
      failedCount: alert.failed,
      error: alert.errors.length ? alert.errors.map((e) => `${e.email}: ${e.error}`).join("; ") : null,
    });

    if (status === "FAILED" || status === "PARTIAL") {
      void reportSystemFailure({
        category: "emailFailure",
        title: "שליחת דוח ספירות יומי נכשלה",
        message: `יום: ${day}\nנשלחו: ${alert.sent} מתוך ${alert.recipientCount}\n${alert.errors
          .map((e) => `${e.email}: ${e.error}`)
          .join("\n")}`,
        entityId: day,
      });
    }

    return {
      ...base,
      ok: status === "SENT" || status === "PARTIAL",
      status,
      recipientCount: alert.recipientCount,
      sent: alert.sent,
      failed: alert.failed,
      deduped: alert.deduped,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishRun(day, { status: "FAILED", error: message });
    void reportSystemFailure({
      category: "cronFailure",
      title: "ריצת דוח ספירות יומי נכשלה",
      message: `יום: ${day}\nשגיאה: ${message}`,
      entityId: day,
    });
    return { ...base, ok: false, status: "FAILED", error: message };
  }
}
