import { compressPdfForOcr } from "./compress-pdf-for-ocr";
import { compressImageBuffer, OCR_COMPRESS_THRESHOLD_BYTES } from "./compress-image";

export { OCR_COMPRESS_THRESHOLD_BYTES } from "./compress-image";

export type CompressedForOcr = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  compressed: boolean;
};

/**
 * @deprecated לא בשימוש — OCR עובד על הקובץ המקורי בלבד (ראו extract-text.ts).
 * Prepare file for OCR.space:
 * - PDF → page 1 JPEG
 * - large images → resize/compress JPEG
 */
export async function compressForOcr(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<CompressedForOcr> {
  if (mimeType === "application/pdf") {
    return compressPdfForOcr(buffer, fileName);
  }

  if (mimeType === "image/webp") {
    const sharp = (await import("sharp")).default;
    buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    mimeType = "image/jpeg";
    fileName = fileName.replace(/\.webp$/i, ".jpg") || "upload.jpg";
  }

  if (!mimeType.startsWith("image/")) {
    return { buffer, mimeType, fileName, compressed: false };
  }

  if (buffer.length <= OCR_COMPRESS_THRESHOLD_BYTES) {
    return { buffer, mimeType, fileName, compressed: false };
  }

  const before = buffer.length;
  const out = await compressImageBuffer(buffer);
  const newName = fileName.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
  console.log("[OCR] compress-for-ocr image:", before, "→", out.length);

  return {
    buffer: out,
    mimeType: "image/jpeg",
    fileName: newName,
    compressed: true,
  };
}
