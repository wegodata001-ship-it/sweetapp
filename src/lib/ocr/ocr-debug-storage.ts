import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const OCR_DEBUG_BUCKET =
  process.env.OCR_DEBUG_BUCKET?.trim() || "ocr-debug";

export type OcrDebugUpload = {
  bucket: string;
  path: string;
  signedUrl: string;
};

/**
 * שמירת הקובץ המקורי לפני OCR — לאחר מכן OCR.space קורא מ־signed URL (bytes זהים ל־storage).
 */
export async function saveOriginalToOcrDebug(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrDebugUpload | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    console.warn("[OCR DEBUG] Supabase not configured — skip ocr-debug upload");
    return null;
  }

  const ext =
    mimeType === "application/pdf"
      ? "pdf"
      : mimeType === "image/png"
        ? "png"
        : "jpg";
  const path = `original-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(OCR_DEBUG_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    console.warn("[OCR DEBUG] upload failed:", error.message);
    return null;
  }

  const { data, error: signErr } = await supabase.storage
    .from(OCR_DEBUG_BUCKET)
    .createSignedUrl(path, 3600);

  if (signErr || !data?.signedUrl) {
    console.warn("[OCR DEBUG] signed URL failed:", signErr?.message);
    return null;
  }

  console.log("[OCR DEBUG] original saved", { bucket: OCR_DEBUG_BUCKET, path });
  return { bucket: OCR_DEBUG_BUCKET, path, signedUrl: data.signedUrl };
}
