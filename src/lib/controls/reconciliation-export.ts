import * as XLSX from "xlsx";
import {
  RECON_COUNTRY_LABELS_HE,
  RECON_STATUS_LABELS_HE,
  type ReconCountry,
} from "@/lib/controls/reconciliation-constants";
import type { ReconImportDetailDto } from "@/lib/controls/reconciliation-types";

function num(n: number | null): number | string {
  return n === null || n === undefined ? "" : n;
}

/** בונה קובץ Excel (xlsx) מלא להתאמת מערכות */
export function buildReconciliationXlsx(detail: ReconImportDetailDto): Buffer {
  const countryLabel =
    RECON_COUNTRY_LABELS_HE[detail.import.country as ReconCountry] ?? detail.import.country;

  const aoa: (string | number)[][] = [
    ["התאמת מערכות"],
    ["מדינה", countryLabel],
    ["שבוע עבודה", detail.import.weekCode],
    ["קובץ", detail.import.fileName],
    ["תאריך ייבוא", new Date(detail.import.importedAt).toLocaleString("he-IL")],
    ["ייבא", detail.import.importedByName ?? ""],
    [],
    ["סה״כ רשומות", detail.kpis.total],
    ["תואמות", detail.kpis.matched],
    ["פערים", detail.kpis.differences],
    ["חסרות ב-WEGO", detail.kpis.missingInWego],
    ["חסרות בחיצוני", detail.kpis.missingInExternal],
    [],
    [
      "קוד לקוח",
      "שם לקוח",
      "מספר הזמנה חיצוני",
      "מספר הזמנה WEGO",
      "סכום חיצוני",
      "סכום WEGO",
      "פער",
      "תאריך חיצוני",
      "סטטוס",
    ],
  ];

  for (const r of detail.rows) {
    aoa.push([
      r.customerCode ?? "",
      r.customerName ?? "",
      r.externalOrderId ?? "",
      r.wegoOrderNumber !== null ? r.wegoOrderNumber : "",
      num(r.externalAmount),
      num(r.wegoAmount),
      num(r.difference),
      r.externalDate ? new Date(r.externalDate).toLocaleDateString("he-IL") : "",
      RECON_STATUS_LABELS_HE[r.status],
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** שם קובץ ייצוא — System_Reconciliation_AH127.xlsx */
export function reconciliationExportFileName(weekCode: string, ext: "xlsx" | "pdf"): string {
  const safeWeek = weekCode.replace(/[^A-Za-z0-9]+/g, "");
  return `System_Reconciliation_${safeWeek || "export"}.${ext}`;
}
