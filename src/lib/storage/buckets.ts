import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** PDF שנוצרים במערכת — הכנסות, הוצאות, דוח Z, כרטסות, מסמכים לרו״ח */
export const REPORTS_BUCKET = "wego-reports";

/** תמונות/PDF מקור לסריקה — JPG, PNG, WEBP, PDF מקור */
export const SOURCE_FILES_BUCKET = "pdf_photo";

export const STORAGE_BUCKET_MISSING = "Storage bucket missing";

const LEGACY_SOURCE_BUCKET_NAMES = new Set([
  "wego-documents",
  "business-documents",
  "documents",
  "uploads",
  "finance-documents",
  "receipts",
]);

export function reportsBucketName(): string {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET?.trim() ||
    REPORTS_BUCKET
  );
}

export function sourceFilesBucketName(): string {
  return (
    process.env.WEGO_SOURCE_FILES_BUCKET?.trim() ||
    process.env.WEGO_DOCUMENTS_BUCKET?.trim() ||
    SOURCE_FILES_BUCKET
  );
}

/** Maps legacy DB bucket names to the approved source bucket. */
export function resolveSourceFilesBucket(stored?: string | null): string {
  const name = stored?.trim();
  if (!name || LEGACY_SOURCE_BUCKET_NAMES.has(name)) {
    return sourceFilesBucketName();
  }
  return name;
}

export function isStorageBucketMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("bucket not found") ||
    m.includes("storage bucket missing") ||
    m.includes("does not exist")
  );
}

export function normalizeStorageError(message: string): string {
  if (isStorageBucketMissingError(message)) return STORAGE_BUCKET_MISSING;
  return message;
}

export async function checkBucketExists(bucket: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error("[checkBucketExists]", bucket, error.message);
      return false;
    }
    return (data ?? []).some((b) => b.name === bucket);
  } catch (e) {
    console.error("[checkBucketExists] failed", bucket, e);
    return false;
  }
}

export async function assertBucketExists(bucket: string): Promise<void> {
  const ok = await checkBucketExists(bucket);
  if (!ok) {
    throw new Error(STORAGE_BUCKET_MISSING);
  }
}

export async function assertUploadBucketsReady(): Promise<void> {
  await assertBucketExists(sourceFilesBucketName());
  await assertBucketExists(reportsBucketName());
}

/** Bucket for a stored object path (reports vs source scans). */
export function bucketForStoragePath(storagePath: string): string {
  const path = storagePath.trim();
  if (path.startsWith("reports/")) {
    return reportsBucketName();
  }
  if (path.startsWith("task-files/")) {
    return reportsBucketName();
  }
  return sourceFilesBucketName();
}
