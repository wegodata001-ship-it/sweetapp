/** סוגי דוח לארכיון — תואם GeneratedReport.type */
export const REPORT_TYPES = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  Z_REPORT: "Z_REPORT",
  CASHFLOW: "CASHFLOW",
  PAYMENT: "PAYMENT",
} as const;

export type ReportTypeValue = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

/**
 * באקט Storage לדוחות PDF / ארכיון — רק בשרת (עם SUPABASE_SERVICE_ROLE_KEY).
 * חובה להגדיר ב-.env: SUPABASE_STORAGE_BUCKET
 * (אופציונלי: NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET אם צריך תאימות לקוד ישן).
 */
export function reportsBucket(): string {
  const b =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET?.trim();
  if (!b) {
    throw new Error(
      "חסר SUPABASE_STORAGE_BUCKET ב-.env — צרו ב-Supabase Storage באקט public (למשל wego-reports) והגדירו את השם",
    );
  }
  return b;
}

/** באקט לקבצים ישנים / צירופים שלא תחת reports/ — בדרך כלל אותו באקט אחרי מיגרציה */
export function attachmentsBucket(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    ""
  );
}

/** בחירת באקט למחיקה לפי נתיח האחסון (דוחות מול קבצים ישנים) */
export function bucketForStoragePath(storagePath: string): string {
  if (storagePath.startsWith("reports/")) {
    return reportsBucket();
  }
  const legacy = attachmentsBucket();
  if (legacy) return legacy;
  return reportsBucket();
}

export function companyStorageSlug(): string {
  return process.env.WEGO_COMPANY_ID?.trim() || "default";
}

const FOLDER: Record<string, string> = {
  INCOME: "income",
  EXPENSE: "expenses",
  Z_REPORT: "z-reports",
  CASHFLOW: "cashflow",
  PAYMENT: "payments",
};

export function buildReportStoragePath(reportType: string, fileName: string): string {
  const dir = FOLDER[reportType] ?? "misc";
  const safe = fileName.replace(/[\\/]+/g, "");
  return `reports/${companyStorageSlug()}/${dir}/${safe}`;
}
