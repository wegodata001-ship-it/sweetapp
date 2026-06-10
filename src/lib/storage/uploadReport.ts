import { buildReportStoragePath, reportsBucket } from "@/lib/pdf/constants";
import {
  assertUploadBucketsReady,
  normalizeStorageError,
  reportsBucketName,
} from "@/lib/storage/buckets";
import { createSignedStorageUrl, getSupabaseServiceClient } from "@/lib/supabase/server";

export type UploadReportToStorageInput = {
  /** תוכן PDF */
  pdfBlob: Uint8Array;
  /** REPORT_TYPES / סוג דוח — קובע תיקייה תחת reports/{company}/… */
  type: string;
  /** שם קובץ בלבד (למשל income-2026-05-10-14-30.pdf) */
  filename: string;
};

export type UploadReportToStorageResult = {
  path: string;
  /** Signed URL — field name kept for DB/API compatibility */
  publicUrl: string;
};

const REPORT_SIGNED_TTL_SEC = 3600;

/**
 * העלאת דוח PDF ל-wego-reports — גישה רק דרך signed URL.
 */
export async function uploadReportToStorage(
  input: UploadReportToStorageInput,
): Promise<UploadReportToStorageResult> {
  const bucket = reportsBucket();
  await assertUploadBucketsReady();

  const path = buildReportStoragePath(input.type, input.filename);

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error("Supabase לא מוגדר — NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY");
  }

  const { error } = await supabase.storage.from(bucket).upload(path, input.pdfBlob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    throw new Error(normalizeStorageError(error.message || "העלאת PDF ל-Storage נכשלה"));
  }

  const signed = await createSignedStorageUrl(bucket, path, REPORT_SIGNED_TTL_SEC);
  if (!signed) {
    throw new Error("לא ניתן ליצור קישור גישה ל-PDF");
  }

  return { path, publicUrl: signed };
}

/** מחיקת אובייקט דוח לפי נתיב מלא בבאקט הדוחות */
export async function removeReportFromStorage(filePath: string): Promise<void> {
  const bucket = reportsBucketName();
  const supabase = getSupabaseServiceClient();
  if (!supabase || !filePath?.trim()) return;
  await supabase.storage.from(bucket).remove([filePath]);
}
