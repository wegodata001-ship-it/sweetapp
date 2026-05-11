import { buildReportStoragePath, reportsBucket } from "@/lib/pdf/constants";
import { getPublicStorageUrl, getSupabaseServiceClient } from "@/lib/supabase/server";

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
  publicUrl: string;
};

/**
 * העלאת דוח PDF ל-Storage — שירות role בלבד, ללא חשיפה ללקוח.
 */
export async function uploadReportToStorage(
  input: UploadReportToStorageInput,
): Promise<UploadReportToStorageResult> {
  const bucket = reportsBucket();
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
    throw new Error(error.message || "העלאת PDF ל-Storage נכשלה");
  }

  const publicUrl = getPublicStorageUrl(bucket, path);
  return { path, publicUrl };
}

/** מחיקת אובייקט דוח לפי נתיב מלא בבאקט הדוחות */
export async function removeReportFromStorage(filePath: string): Promise<void> {
  const bucket = reportsBucket();
  const supabase = getSupabaseServiceClient();
  if (!supabase || !filePath?.trim()) return;
  await supabase.storage.from(bucket).remove([filePath]);
}
