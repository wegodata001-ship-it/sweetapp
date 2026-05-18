import { getPublicStorageUrl, getSupabaseServiceClient } from "@/lib/supabase/server";
import { attachmentsBucket, companyStorageSlug, reportsBucket } from "@/lib/pdf/constants";

/**
 * Upload a scanned receipt to Supabase Storage and return a public URL.
 *
 * Files are stored under:
 *   <bucket>/receipts/<companySlug>/<timestamp>-<safeName>
 *
 * On environments without Supabase configured the function returns null so
 * the scan flow degrades gracefully (the parsed JSON is still returned).
 */
export async function uploadReceiptToStorage(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<{ url: string; path: string } | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  let bucket = "";
  try {
    bucket = attachmentsBucket() || reportsBucket();
  } catch {
    return null;
  }
  if (!bucket) return null;

  const safe = fileName
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._\-]+/g, "_")
    .slice(0, 80);
  const path = `receipts/${companyStorageSlug()}/${Date.now()}-${safe}`;

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("[uploadReceiptToStorage] supabase error", error.message);
      return null;
    }
    const url = getPublicStorageUrl(bucket, path);
    return url ? { url, path } : null;
  } catch (e) {
    console.error(
      "[uploadReceiptToStorage] failed",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
