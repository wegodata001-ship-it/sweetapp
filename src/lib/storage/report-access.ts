import { createSignedStorageUrl } from "@/lib/supabase/server";
import { reportsBucketName } from "@/lib/storage/buckets";

const DEFAULT_REPORT_SIGNED_TTL_SEC = 3600;

export async function signedUrlForReportFile(
  filePath: string,
  bucket = reportsBucketName(),
  expiresInSec = DEFAULT_REPORT_SIGNED_TTL_SEC,
): Promise<string | null> {
  const path = filePath?.trim();
  if (!path) return null;
  return createSignedStorageUrl(bucket, path, expiresInSec);
}

export async function enrichReportWithSignedUrl<T extends { filePath: string; publicUrl?: string | null }>(
  row: T,
  bucket = reportsBucketName(),
): Promise<T & { publicUrl: string | null; pdfUrl: string | null }> {
  const signed = await signedUrlForReportFile(row.filePath, bucket);
  return {
    ...row,
    publicUrl: signed,
    pdfUrl: signed,
  };
}

export async function resolveReportPdfUrl(
  report: { filePath: string; publicUrl?: string | null } | null | undefined,
  bucket = reportsBucketName(),
): Promise<string | null> {
  if (!report?.filePath?.trim()) return null;
  return signedUrlForReportFile(report.filePath, bucket);
}
