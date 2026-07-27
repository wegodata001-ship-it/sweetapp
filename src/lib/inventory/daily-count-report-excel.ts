/**
 * Excel של דוח סיכום הספירות היומי.
 * אותה ספרייה ואותה גישה (aoa_to_sheet) כמו ייצוא סשן בודד, כדי שכל הייצואים
 * במערכת ייראו וייקראו אותו דבר.
 */
import * as XLSX from "xlsx";
import type { InventoryDailyReport } from "@/lib/inventory/daily-count-report";

function businessName(): string {
  return (
    process.env.WEGO_BUSINESS_NAME?.trim() ||
    process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() ||
    "WEGO BUSINESS"
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL");
}

/** גיליון עם רוחבי עמודות, כדי שהקובץ יהיה קריא בפתיחה בלי התאמה ידנית */
function addSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: (string | number)[][],
  widths: number[],
): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

export function inventoryDailyReportExcel(report: InventoryDailyReport): Buffer {
  /** בטווח מרובה ימים שעה בלבד אינה מספיקה לזיהוי השורה */
  const fmtMoment = report.isRange ? fmtDateTime : fmtTime;

  const summary: (string | number)[][] = [
    ["שם העסק", businessName()],
    report.isRange
      ? ["תקופת הדוח", `${report.from} — ${report.to}`]
      : ["תאריך הדוח", report.day],
    ["הופק בתאריך", fmtDateTime(report.generatedAt)],
    ["ספירה ראשונה", fmtMoment(report.firstCountAt)],
    ["ספירה אחרונה", fmtMoment(report.lastCountAt)],
    ["מבצעי הספירות", report.counters.join(", ")],
    [],
    ["סיכום"],
    ["ספירות שבוצעו", report.sessionCount],
    ["מיקומים שנספרו", report.locationsCounted],
    ["מוצרים שנבדקו", report.totals.productsChecked],
    ["תקינים", report.totals.ok],
    ["חוסרים", report.totals.shortage],
    ["עודפים", report.totals.surplus],
    ["חריגות", report.totals.anomalies],
    ["סה״כ יחידות שנספרו", report.totals.totalCountedQty],
    ["מוצרים שנוספו במהלך הספירה", report.totals.addedDuringCount],
    ["מוצרים שהוסרו מהספירה", report.totals.removedFromCount],
    ["זמן ספירה כולל (דקות)", report.totals.totalDurationMinutes],
    ["זמן ממוצע לספירה (דקות)", report.totals.avgDurationMinutes ?? ""],
  ];

  const locations: (string | number)[][] = [
    [
      "מיקום אחסון",
      "ספירות",
      "מוצרים",
      "תקינים",
      "חוסרים",
      "עודפים",
      "סה״כ יחידות",
      "נוספו",
      "הוסרו",
    ],
    ...report.byLocation.map((row) => [
      row.locationName,
      row.sessionCount,
      row.productCount,
      row.matchCount,
      row.shortageCount,
      row.surplusCount,
      row.totalCountedQty,
      row.addedCount,
      row.removedCount,
    ]),
  ];

  const sessions: (string | number)[][] = [
    [
      ...(report.isRange ? ["תאריך"] : []),
      "מספר ספירה",
      "מבצע הספירה",
      "מיקום אחסון",
      "שעת התחלה",
      "שעת סיום",
      "משך (דקות)",
      "מוצרים",
      "תקינים",
      "חוסרים",
      "עודפים",
      "סה״כ יחידות",
      "סטטוס",
    ],
    ...report.sessions.map((row) => [
      ...(report.isRange ? [row.day] : []),
      row.sessionNumber,
      row.countedByName,
      row.locationName,
      fmtTime(row.startedAt),
      fmtTime(row.endedAt),
      row.durationMinutes ?? "",
      row.productCount,
      row.matchCount,
      row.shortageCount,
      row.surplusCount,
      row.totalCountedQty,
      row.status,
    ]),
  ];

  const lines: (string | number)[][] = [
    [
      "מספר ספירה",
      "מיקום אחסון",
      "שם מוצר",
      "ברקוד",
      "יחידה",
      "כמות קודמת",
      "נספר",
      "הפרש",
      "מינימום",
      "חוסר מול מינימום",
      "פירוט עובדים",
    ],
    ...report.lines.map((row) => [
      row.sessionNumber,
      row.locationName,
      row.productName,
      row.barcode,
      row.unit,
      row.previousQuantity,
      row.currentQuantity,
      row.difference,
      row.minimumQuantity,
      row.shortageVsMinimum,
      row.workersText,
    ]),
  ];

  const removed: (string | number)[][] = [
    ["שם מוצר", "מיקום אחסון", report.isRange ? "מועד הסרה" : "שעת הסרה", "הוסר על ידי", "סיבה"],
    ...report.removedRows.map((row) => [
      row.productName,
      row.locationName,
      fmtMoment(row.removedAt),
      row.removedByName,
      row.reason,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, "סיכום", summary, [26, 34]);
  addSheet(wb, "לפי מיקום", locations, [26, 10, 10, 10, 10, 10, 14, 10, 10]);
  addSheet(wb, "ספירות", sessions, [
    ...(report.isRange ? [12] : []),
    12, 24, 22, 12, 12, 12, 10, 10, 10, 10, 14, 12,
  ]);
  addSheet(wb, "מוצרים", lines, [12, 20, 34, 18, 10, 13, 10, 10, 11, 18, 40]);
  addSheet(wb, "הוסרו מהספירה", removed, [34, 22, report.isRange ? 20 : 12, 22, 30]);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
