export type InvoiceImageSource = "phone_photo" | "digital";

/**
 * מבדיל צילום טלפון (זווית/צל) מ-PNG/PDF נקי מהמערכת.
 * PNG/PDF — ללא preprocessing לפני OCR.
 */
export async function detectInvoiceImageSource(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<InvoiceImageSource> {
  if (process.env.OCR_FORCE_PHONE_PREPROCESS === "1") return "phone_photo";
  if (process.env.OCR_SKIP_PHONE_PREPROCESS === "1") return "digital";

  if (mimeType === "application/pdf") return "digital";
  if (mimeType === "image/png" || /\.png$/i.test(fileName)) return "digital";

  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || /\.jpe?g$/i.test(fileName)) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const pixels = w * h;
      if (pixels >= 2_500_000 || buffer.length >= 1_200_000) {
        return "phone_photo";
      }
      if (w > 0 && h > 0 && w / h > 0.45 && w / h < 2.2 && pixels < 1_200_000) {
        return "digital";
      }
    } catch {
      return buffer.length > 900_000 ? "phone_photo" : "digital";
    }
    return buffer.length > 1_000_000 ? "phone_photo" : "digital";
  }

  return "digital";
}
