import { getPdfPageCount, isPdfBuffer } from "./pdf-to-image";
import { preprocessImageForScan } from "./preprocess-image";
import { isPdfMimeType } from "./upload-mime";

export type ScanInputMode = "pdf_native" | "image";

export type PreparedScanInput = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  scanMode: ScanInputMode;
  pdfPageCount?: number;
  /** מקור PDF מקורי (לשליחה ישירה ל-Gemini) */
  pdfBuffer?: Buffer;
};

/** תמונה → preprocess | PDF → native Gemini (עם fallback לעמודים ב-runner) */
export async function prepareScanInput(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<PreparedScanInput> {
  const totalStart = Date.now();

  const isPdf = isPdfMimeType(mimeType) || isPdfBuffer(buffer);
  if (isPdf) {
    const pageCount = await getPdfPageCount(buffer);
    console.log("OCR_PREPROCESS_MS", Date.now() - totalStart, {
      step: "pdf_detect",
      pageCount,
      bytes: buffer.length,
      mode: "pdf_native",
    });
    return {
      buffer,
      mimeType: "application/pdf",
      fileName: fileName.replace(/\.pdf$/i, "") + ".pdf",
      scanMode: "pdf_native",
      pdfPageCount: pageCount,
      pdfBuffer: buffer,
    };
  }

  if (mimeType.startsWith("image/")) {
    const processed = await preprocessImageForScan(buffer, mimeType);
    const ext = processed.mimeType === "image/jpeg" ? ".jpg" : ".png";
    console.log("OCR_PREPROCESS_MS", Date.now() - totalStart, {
      step: "image_total",
      mimeType: processed.mimeType,
      mode: "image",
    });
    return {
      buffer: processed.buffer,
      mimeType: processed.mimeType,
      fileName: fileName.replace(/\.(jpe?g|webp|png)$/i, ext) || `document${ext}`,
      scanMode: "image",
    };
  }

  console.log("OCR_PREPROCESS_MS", Date.now() - totalStart, { step: "passthrough" });
  return { buffer, mimeType, fileName, scanMode: "image" };
}
