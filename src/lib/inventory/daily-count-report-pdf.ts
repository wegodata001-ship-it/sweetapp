/**
 * PDF של דוח סיכום הספירות היומי — נבנה על מנוע ה־PDF האחיד בלבד.
 * הפונטים, הכיווניות (RTL/LTR), ה־Theme וכותרות העמודים מגיעים מהמנוע,
 * כך שהדוח נראה כמו כל מסמך אחר במערכת ותומך בעברית, ערבית ואנגלית.
 */
import { PDF_COLORS } from "@/lib/pdf/pdf-theme";
import { createPdf, type PdfContext } from "@/lib/pdf/pdf-engine";
import { drawTable } from "@/lib/pdf/pdf-table";
import {
  formatDate,
  formatDateTime,
  formatQuantity,
  formatSigned,
  ltrIsolate,
  safeFileNamePart,
} from "@/lib/pdf/pdf-utils";
import type { InventoryDailyReport } from "@/lib/inventory/daily-count-report";

function timeOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return ltrIsolate(`${hh}:${mi}`);
}

/** סטטוס הסשן הוא COMPLETED בפועל; קוד לא מזוהה מוצג כמו שהוא ולא מוסתר */
function statusLabel(status: string, t: PdfContext["t"]): string {
  return status === "COMPLETED" ? t("report.statusCompleted") : status;
}

function dayOnly(day: string): string {
  return formatDate(`${day}T00:00:00`);
}

/** דקות → "45 דק׳" או "3:15 שעות", כדי שסכומים גדולים יישארו קריאים */
function formatDuration(minutes: number, t: PdfContext["t"]): string {
  if (minutes < 60) return `${ltrIsolate(String(minutes))} ${t("report.minutes")}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${ltrIsolate(`${h}:${String(m).padStart(2, "0")}`)} ${t("report.hours")}`;
}

async function renderReport(ctx: PdfContext, report: InventoryDailyReport): Promise<void> {
  const { layout, t } = ctx;

  await layout.infoPanel([
    report.isRange
      ? {
          label: t("report.reportPeriod"),
          value: `${dayOnly(report.from)} – ${dayOnly(report.to)}`,
        }
      : { label: t("date"), value: dayOnly(report.day) },
    { label: t("generatedAt"), value: formatDateTime(report.generatedAt) },
    { label: t("report.countsPerformed"), value: ltrIsolate(String(report.sessionCount)) },
    {
      label: t("report.locationsCounted"),
      value: ltrIsolate(String(report.locationsCounted)),
    },
    { label: t("report.counters"), value: report.counters.join(", ") },
  ]);

  await layout.sectionTitle(t("summary"));
  await layout.infoPanel(
    [
      {
        label: t("report.productsChecked"),
        value: ltrIsolate(String(report.totals.productsChecked)),
      },
      { label: t("report.ok"), value: ltrIsolate(String(report.totals.ok)) },
      { label: t("report.shortage"), value: ltrIsolate(String(report.totals.shortage)) },
      { label: t("report.surplus"), value: ltrIsolate(String(report.totals.surplus)) },
      { label: t("report.anomalies"), value: ltrIsolate(String(report.totals.anomalies)) },
      {
        label: t("report.totalCounted"),
        value: formatQuantity(report.totals.totalCountedQty),
      },
      {
        label: t("report.addedDuringCount"),
        value: ltrIsolate(String(report.totals.addedDuringCount)),
      },
      {
        label: t("report.removedFromCount"),
        value: ltrIsolate(String(report.totals.removedFromCount)),
      },
      // מוצג רק כשיש ספירות עם שעת התחלה מתועדת — ספירות ותיקות אינן כאלה
      ...(report.totals.sessionsWithDuration > 0
        ? [
            {
              label: t("report.totalDuration"),
              value: formatDuration(report.totals.totalDurationMinutes, t),
            },
            {
              label: t("report.avgDuration"),
              value: formatDuration(report.totals.avgDurationMinutes ?? 0, t),
            },
          ]
        : []),
    ],
    2,
  );

  if (report.sessionCount === 0) {
    await layout.paragraph(t("report.noCounts"), { color: PDF_COLORS.textMuted });
    return;
  }

  await layout.sectionTitle(t("report.byLocation"));
  await drawTable(layout, {
    rows: report.byLocation,
    emptyText: t("noRows"),
    wrapHeaders: true,
    columns: [
      { header: t("location"), width: 24, value: (r) => r.locationName, wrap: true },
      {
        header: t("report.countsShort"),
        width: 11,
        align: "end",
        value: (r) => ltrIsolate(String(r.sessionCount)),
      },
      {
        header: t("report.productsShort"),
        width: 12,
        align: "end",
        value: (r) => ltrIsolate(String(r.productCount)),
      },
      {
        header: t("report.ok"),
        width: 11,
        align: "end",
        value: (r) => ltrIsolate(String(r.matchCount)),
      },
      {
        header: t("report.shortage"),
        width: 11,
        align: "end",
        value: (r) => ltrIsolate(String(r.shortageCount)),
        color: (r) => (r.shortageCount > 0 ? PDF_COLORS.negative : undefined),
      },
      {
        header: t("report.surplus"),
        width: 11,
        align: "end",
        value: (r) => ltrIsolate(String(r.surplusCount)),
      },
      {
        header: t("report.addedShort"),
        width: 10,
        align: "end",
        value: (r) => ltrIsolate(String(r.addedCount)),
      },
      {
        header: t("report.removedShort"),
        width: 10,
        align: "end",
        value: (r) => ltrIsolate(String(r.removedCount)),
      },
    ],
  });

  await layout.sectionTitle(t("report.sessionsDetail"));
  await drawTable(layout, {
    rows: report.sessions,
    emptyText: t("noRows"),
    wrapHeaders: true,
    columns: [
      // בדוח של יום בודד התאריך זהה בכל השורות ומופיע כבר בראש המסמך
      ...(report.isRange
        ? [
            {
              header: t("date"),
              width: 15,
              align: "end" as const,
              value: (r: (typeof report.sessions)[number]) => dayOnly(r.day),
            },
          ]
        : []),
      {
        header: t("report.sessionNumber"),
        width: report.isRange ? 8 : 10,
        align: "end",
        value: (r) => ltrIsolate(String(r.sessionNumber)),
      },
      {
        header: t("report.countedBy"),
        width: report.isRange ? 13 : 16,
        value: (r) => r.countedByName,
        wrap: true,
      },
      {
        header: t("location"),
        width: report.isRange ? 12 : 15,
        value: (r) => r.locationName,
        wrap: true,
      },
      {
        // עמודה צרה: שעה חסרה מסומנת במקף, ההסבר המלא מופיע בעמודת המשך
        header: t("report.startTime"),
        width: report.isRange ? 10 : 11,
        align: "end",
        value: (r) => timeOnly(r.startedAt) || "—",
      },
      {
        header: t("report.endTime"),
        width: report.isRange ? 10 : 11,
        align: "end",
        value: (r) => timeOnly(r.endedAt),
      },
      {
        header: t("report.duration"),
        width: report.isRange ? 11 : 13,
        align: "end",
        value: (r) =>
          r.durationMinutes == null
            ? "—"
            : `${ltrIsolate(String(r.durationMinutes))} ${t("report.minutes")}`,
      },
      {
        header: t("report.productsShort"),
        width: report.isRange ? 9 : 11,
        align: "end",
        value: (r) => ltrIsolate(String(r.productCount)),
      },
      {
        header: t("status"),
        width: report.isRange ? 12 : 13,
        value: (r) => statusLabel(r.status, t),
      },
    ],
  });

  if (report.removedRows.length > 0) {
    await layout.sectionTitle(t("report.removedDetail"));
    await drawTable(layout, {
      rows: report.removedRows,
      emptyText: t("noRows"),
      wrapHeaders: true,
      columns: [
        { header: t("product"), width: 32, value: (r) => r.productName, wrap: true },
        { header: t("location"), width: 20, value: (r) => r.locationName, wrap: true },
        {
          header: t("report.removedAt"),
          width: 14,
          align: "end",
          value: (r) => timeOnly(r.removedAt),
        },
        { header: t("report.removedBy"), width: 18, value: (r) => r.removedByName, wrap: true },
        { header: t("report.reason"), width: 16, value: (r) => r.reason, wrap: true },
      ],
    });
  }

  await layout.sectionTitle(t("report.linesDetail"));
  if (report.linesTruncated) {
    await layout.paragraph(t("report.linesTruncated"), { color: PDF_COLORS.textMuted });
  }
  await drawTable(layout, {
    rows: report.lines,
    emptyText: t("noRows"),
    wrapHeaders: true,
    columns: [
      { header: t("product"), width: 22, value: (r) => r.productName, wrap: true },
      { header: t("location"), width: 12, value: (r) => r.locationName, wrap: true },
      {
        header: t("report.sessionNumber"),
        width: 10,
        align: "end",
        value: (r) => ltrIsolate(String(r.sessionNumber)),
      },
      {
        header: t("previous"),
        width: 12,
        align: "end",
        value: (r) => formatQuantity(r.previousQuantity),
      },
      {
        header: t("counted"),
        width: 12,
        align: "end",
        value: (r) => formatQuantity(r.currentQuantity),
      },
      {
        header: t("difference"),
        width: 11,
        align: "end",
        value: (r) => formatSigned(r.difference),
        color: (r) =>
          r.difference < 0
            ? PDF_COLORS.negative
            : r.difference > 0
              ? PDF_COLORS.positive
              : undefined,
      },
      { header: t("minimum"), width: 11, align: "end", value: (r) => formatQuantity(r.minimumQuantity) },
      {
        header: t("required"),
        width: 12,
        align: "end",
        value: (r) => formatQuantity(r.shortageVsMinimum),
        color: (r) => (r.shortageVsMinimum > 0 ? PDF_COLORS.negative : undefined),
      },
    ],
  });
}

/** מזהה טקסטואלי של תקופת הדוח — יום בודד או טווח */
export function reportPeriodKey(report: Pick<InventoryDailyReport, "from" | "to">): string {
  return report.from === report.to ? report.from : `${report.from}_${report.to}`;
}

export async function inventoryDailyReportPdf(
  report: InventoryDailyReport,
  language?: string | null,
): Promise<Uint8Array> {
  const period = report.isRange ? `${report.from} – ${report.to}` : report.day;
  const created = await createPdf({
    // דוח יום נשאר "סיכום ספירות יומי"; טווח מקבל כותרת תקופתית
    documentType: report.isRange ? "inventoryCountSummary" : "inventoryDailyReport",
    data: report,
    language,
    subtitle: period,
    render: renderReport,
    metadata: { subject: `Inventory count summary ${period}` },
  });
  return created.bytes;
}

export function inventoryDailyReportFileName(day: string, ext: "pdf" | "xlsx"): string {
  return `${safeFileNamePart(`inventory-daily-report-${day}`)}.${ext}`;
}

export function inventoryCountSummaryFileName(
  report: Pick<InventoryDailyReport, "from" | "to">,
  ext: "pdf" | "xlsx",
): string {
  return `${safeFileNamePart(`inventory-count-summary-${reportPeriodKey(report)}`)}.${ext}`;
}
