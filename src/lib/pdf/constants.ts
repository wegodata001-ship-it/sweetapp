/** סוגי דוח לארכיון — תואם GeneratedReport.type */
export const REPORT_TYPES = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  Z_REPORT: "Z_REPORT",
  CASHFLOW: "CASHFLOW",
  PAYMENT: "PAYMENT",
} as const;

export type ReportTypeValue = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

export {
  REPORTS_BUCKET,
  SOURCE_FILES_BUCKET,
  STORAGE_BUCKET_MISSING,
  bucketForStoragePath,
  checkBucketExists,
  assertBucketExists,
  assertUploadBucketsReady,
  reportsBucketName,
  sourceFilesBucketName,
  resolveSourceFilesBucket,
} from "@/lib/storage/buckets";

import { reportsBucketName } from "@/lib/storage/buckets";

/** PDF reports bucket — wego-reports */
export function reportsBucket(): string {
  return reportsBucketName();
}

/** @deprecated use reportsBucket() — legacy alias */
export function attachmentsBucket(): string {
  return reportsBucketName();
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
