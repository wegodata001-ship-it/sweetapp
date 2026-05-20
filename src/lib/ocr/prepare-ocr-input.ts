import { renderPdfFirstPageToPng } from "./pdf-to-image";
import { preprocessImageForOcr } from "./preprocess-for-ocr";

export type PreparedOcrInput = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

/**
 * PDF → PNG page 1; תמונות → preprocessing לפני OCR.
 */
export async function prepareOcrInput(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<PreparedOcrInput> {
  if (mimeType === "application/pdf") {
    const png = await renderPdfFirstPageToPng(buffer);
    const processed = await preprocessImageForOcr(png);
    return {
      buffer: processed,
      mimeType: "image/png",
      fileName: fileName.replace(/\.pdf$/i, "") + "-p1.png",
    };
  }

  if (mimeType.startsWith("image/")) {
    const processed = await preprocessImageForOcr(buffer);
    return {
      buffer: processed,
      mimeType: "image/png",
      fileName: fileName.replace(/\.(jpe?g|webp)$/i, ".png") || "invoice.png",
    };
  }

  return { buffer, mimeType, fileName };
}
