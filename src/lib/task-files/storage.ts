import { getPublicStorageUrl, getSupabaseServiceClient } from "@/lib/supabase/server";
import { attachmentsBucket, companyStorageSlug, reportsBucket } from "@/lib/pdf/constants";

/**
 * MIME types accepted for task-group file uploads.
 * Matches the requirement: PDF, PNG, JPG, DOCX, XLSX, ZIP (+ common siblings).
 */
export const TASK_FILE_ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

export const TASK_FILE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function isAllowedTaskFileMime(m: string): boolean {
  return (TASK_FILE_ALLOWED_MIME as readonly string[]).includes(m);
}

/**
 * Sanitize a user-provided file name for safe storage paths:
 * - drops directory separators
 * - replaces unsafe chars with underscores
 * - clamps length to 80 chars (keeps extension intact)
 */
export function safeStorageFileName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/]+/g, "-").replace(/[^A-Za-z0-9._\-]+/g, "_");
  if (cleaned.length <= 80) return cleaned;
  const dotIdx = cleaned.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx >= cleaned.length - 10) {
    const ext = cleaned.slice(dotIdx);
    return cleaned.slice(0, 80 - ext.length) + ext;
  }
  return cleaned.slice(0, 80);
}

/**
 * Upload a task-group attachment to Supabase Storage.
 *
 * Layout: `<bucket>/task-files/<companySlug>/<groupId>/<timestamp>-<safeName>`
 *
 * Returns null when Supabase isn't configured so the caller can fall back to
 * an error response.
 */
export async function uploadTaskFile(input: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  groupId: string;
}): Promise<{ url: string; path: string; bucket: string } | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  let bucket = "";
  try {
    bucket = attachmentsBucket() || reportsBucket();
  } catch {
    return null;
  }
  if (!bucket) return null;

  const safe = safeStorageFileName(input.fileName);
  const path = `task-files/${companyStorageSlug()}/${input.groupId}/${Date.now()}-${safe}`;

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, input.buffer, {
      contentType: input.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("[uploadTaskFile] supabase error", error.message);
      return null;
    }
    const url = getPublicStorageUrl(bucket, path);
    return url ? { url, path, bucket } : null;
  } catch (e) {
    console.error(
      "[uploadTaskFile] failed",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * Delete a previously uploaded task-file from Storage. Best-effort — failures
 * are logged but not surfaced to the caller (the DB row is the source of truth).
 */
export async function deleteTaskFileFromStorage(storagePath: string): Promise<void> {
  if (!storagePath) return;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;
  let bucket = "";
  try {
    bucket = attachmentsBucket() || reportsBucket();
  } catch {
    return;
  }
  if (!bucket) return;
  try {
    await supabase.storage.from(bucket).remove([storagePath]);
  } catch (e) {
    console.error(
      "[deleteTaskFileFromStorage] failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}
