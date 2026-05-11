import { REPORT_TYPES, type ReportTypeValue } from "@/lib/pdf/constants";

const pad = (n: number) => String(n).padStart(2, "0");

/** זמן יצירה בקובץ — HH-mm */
function timePart(d: Date): string {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/**
 * שמות קבצי PDF אחידים ל-ERP (תאריך לפי מסמך / תנועה; שעה לפי רגע יצירה).
 */
export function erpReportFileName(
  reportType: ReportTypeValue | string,
  documentDate: Date,
  generatedAt: Date = new Date(),
): string {
  const dateStr = documentDate.toISOString().slice(0, 10);
  const t = timePart(generatedAt);
  switch (reportType) {
    case REPORT_TYPES.INCOME:
      return `income-${dateStr}-${t}.pdf`;
    case REPORT_TYPES.EXPENSE:
      return `expense-${dateStr}-${t}.pdf`;
    case REPORT_TYPES.Z_REPORT:
      return `z-report-${dateStr}.pdf`;
    case REPORT_TYPES.CASHFLOW:
      return `cashflow-${dateStr}-${t}.pdf`;
    case REPORT_TYPES.PAYMENT:
      return `payment-${dateStr}-${t}.pdf`;
    default:
      return `report-${dateStr}-${t}.pdf`;
  }
}
