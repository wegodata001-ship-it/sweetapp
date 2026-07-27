/**
 * בניית המייל והקבצים המצורפים לסיכום ספירות.
 * משותף לדוח היומי האוטומטי (cron) ולשליחה היזומה ממסך הספירה, כדי ששני
 * המסלולים יפיקו בדיוק את אותו תוכן.
 */
import { getEmailConfig } from "@/lib/email/config";
import type { SystemEmailAttachment } from "@/lib/email/types";
import type { InventoryDailyReport } from "@/lib/inventory/daily-count-report";
import { inventoryDailyReportExcel } from "@/lib/inventory/daily-count-report-excel";
import { inventoryDailyReportPdf } from "@/lib/inventory/daily-count-report-pdf";

export function fmtReportTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function fmtReportDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** דקות → "45 דק׳" או "3:15 שעות" */
export function fmtDurationLabel(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} דק׳`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} שעות`;
}

/** תיאור תקופת הדוח לכותרות ולגוף המייל */
export function reportPeriodLabel(report: Pick<InventoryDailyReport, "from" | "to">): string {
  return report.from === report.to
    ? fmtReportDate(report.from)
    : `${fmtReportDate(report.from)} — ${fmtReportDate(report.to)}`;
}

export type ReportEmailExtras = {
  intro?: string;
  headline?: string;
  /** כשקיים, המייל מוצג כדוח תקופה ולא כדוח יום */
  periodLabel?: string;
};

export function buildReportEmailData(
  report: InventoryDailyReport,
  attachmentNames: string[],
  extras: ReportEmailExtras = {},
) {
  const { appUrl } = getEmailConfig();
  return {
    appUrl,
    reportDay: report.day,
    reportDateLabel: fmtReportDate(report.day),
    generatedAtLabel: new Date(report.generatedAt).toLocaleString("he-IL"),
    sessionCount: report.sessionCount,
    locationsCounted: report.locationsCounted,
    productsChecked: report.totals.productsChecked,
    ok: report.totals.ok,
    shortage: report.totals.shortage,
    surplus: report.totals.surplus,
    anomalies: report.totals.anomalies,
    addedDuringCount: report.totals.addedDuringCount,
    removedFromCount: report.totals.removedFromCount,
    totalCountedQty: report.totals.totalCountedQty,
    counters: report.counters.join(", "),
    totalDurationLabel:
      report.totals.sessionsWithDuration > 0
        ? fmtDurationLabel(report.totals.totalDurationMinutes)
        : undefined,
    avgDurationLabel:
      report.totals.sessionsWithDuration > 0
        ? fmtDurationLabel(report.totals.avgDurationMinutes)
        : undefined,
    locations: report.byLocation.map((row) => ({
      locationName: row.locationName,
      sessionCount: row.sessionCount,
      productCount: row.productCount,
      shortageCount: row.shortageCount,
      surplusCount: row.surplusCount,
    })),
    sessions: report.sessions.map((row) => ({
      sessionNumber: row.sessionNumber,
      countedByName: row.countedByName,
      locationName: row.locationName,
      date: report.isRange ? fmtReportDate(row.day) : undefined,
      startTime: fmtReportTime(row.startedAt),
      endTime: fmtReportTime(row.endedAt),
      duration: row.durationMinutes == null ? "—" : `${row.durationMinutes} דק׳`,
      status: row.status,
    })),
    attachmentNote: attachmentNames.length
      ? `מצורפים: ${attachmentNames.join(" · ")}`
      : "הפקת הקבצים המצורפים נכשלה — נתוני הסיכום מופיעים במייל.",
    actionUrl: `${appUrl}/ops/inventory`,
    ...extras,
  };
}

export type AttachmentFailure = { kind: "pdf" | "xlsx"; error: string };

export type BuiltAttachments = {
  attachments: SystemEmailAttachment[];
  names: string[];
  failures: AttachmentFailure[];
};

/**
 * הפקת PDF ו־Excel. כישלון בקובץ אחד לא מבטל את המייל — הסיכום נשלח בכל מקרה
 * והתקלה מוחזרת לקורא כדי שידווח עליה.
 */
export async function buildReportAttachments(
  report: InventoryDailyReport,
  fileName: (ext: "pdf" | "xlsx") => string,
  language?: string | null,
): Promise<BuiltAttachments> {
  const attachments: SystemEmailAttachment[] = [];
  const failures: AttachmentFailure[] = [];

  try {
    const pdf = await inventoryDailyReportPdf(report, language ?? "he");
    attachments.push({ filename: fileName("pdf"), content: Buffer.from(pdf) });
  } catch (e) {
    failures.push({ kind: "pdf", error: e instanceof Error ? e.message : String(e) });
  }

  try {
    attachments.push({ filename: fileName("xlsx"), content: inventoryDailyReportExcel(report) });
  } catch (e) {
    failures.push({ kind: "xlsx", error: e instanceof Error ? e.message : String(e) });
  }

  return { attachments, names: attachments.map((a) => a.filename), failures };
}
