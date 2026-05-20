import { OcrServiceError } from "./ocr-errors";
import {
  getOcrFromCache,
  hashFileBuffer,
  setOcrCache,
  truncateRawOcrResponse,
} from "./ocr-cache";
import { getPdfPageCount } from "./compress-pdf-for-ocr";
import { parseOverlayFromRawResponse } from "./ocr-overlay";
import { saveOriginalToOcrDebug } from "./ocr-debug-storage";
import { detectInvoiceImageSource } from "./invoice-source-detect";
import { logOcrFileIntegrity } from "./original-file-integrity";
import { preprocessForPhonePhoto } from "./phone-photo-preprocess";
import { ocrSpaceConfigured, runOcrSpace } from "./ocr-space";
import type { OcrEngineResult } from "./types";

/**
 * OCR via OCR.space — ללא resize/compress.
 * הקובץ שנשלח ל־OCR הוא אותו Buffer מקורי (או signed URL לאותו קובץ ב־Storage).
 */
export type ExtractTextMeta = {
  fileHash?: string;
  route?: string;
  onOcrInputMode?: (mode: "signed_url" | "direct_buffer") => void;
};

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  fileName = "upload",
  meta?: ExtractTextMeta,
): Promise<OcrEngineResult> {
  if (!ocrSpaceConfigured()) {
    console.warn("[OCR] OCR_SPACE_API_KEY missing");
    return { text: "", engine: "ocr_space", confidence: 0 };
  }

  const fileHash = meta?.fileHash ?? hashFileBuffer(buffer);
  logOcrFileIntegrity({
    size: buffer.length,
    mime: mimeType,
    hash: fileHash,
    fileName,
    route: meta?.route,
  });

  let pdfPageCount: number | undefined;
  if (mimeType === "application/pdf") {
    try {
      pdfPageCount = await getPdfPageCount(buffer);
      console.log("[OCR] pdf page count:", pdfPageCount);
    } catch (e) {
      console.warn("[OCR] pdf page count failed:", e);
    }
  }

  const cached = await getOcrFromCache(fileHash);
  if (cached) {
    const overlay = parseOverlayFromRawResponse(cached.rawResponse);
    if (overlay.length === 0) {
      console.warn(
        "[OCR] ocr_cache hit without TextOverlay — delete row or rescan for position parsing",
        fileHash.slice(0, 12),
      );
    }
    const lines =
      overlay.length > 0 ? overlay.map((l) => l.text) : cached.rawText.split("\n");
    return {
      text: cached.rawText,
      engine: `${cached.engine}_cache`,
      confidence: cached.confidence,
      pdfPageCount,
      overlay,
      lines,
      ocrLanguage: cached.rawResponse?.includes("language=heb") ? "heb" : "cache",
      ocrEngine: "cache",
    };
  }

  const debugUpload = await saveOriginalToOcrDebug(buffer, mimeType);
  const ocrInputMode = debugUpload?.signedUrl ? "signed_url" : "direct_buffer";
  meta?.onOcrInputMode?.(ocrInputMode);
  if (debugUpload) {
    logOcrFileIntegrity({
      size: buffer.length,
      mime: mimeType,
      hash: fileHash,
      fileName,
      route: meta?.route,
      debugPath: `${debugUpload.bucket}/${debugUpload.path}`,
    });
  }

  let ocrBuffer = buffer;
  let ocrMime = mimeType;
  if (mimeType.startsWith("image/")) {
    const source = await detectInvoiceImageSource(buffer, mimeType, fileName);
    console.log("[OCR] image source:", source);
    if (source === "phone_photo") {
      ocrBuffer = await preprocessForPhonePhoto(buffer);
      ocrMime = "image/jpeg";
    }
  }

  const ocrStart = Date.now();

  try {
    const useSignedUrl =
      debugUpload?.signedUrl && ocrBuffer === buffer ? debugUpload.signedUrl : undefined;

    const { rawText, confidence, rawApiResponse, overlay, ocrLanguage, ocrEngine, lines } =
      await runOcrSpace(ocrBuffer, ocrMime, fileName, {
        sourceUrl: useSignedUrl,
        fileHash,
      });
    console.log("[OCR] OCR recognize duration ms:", Date.now() - ocrStart);
    console.log("[OCR RESPONSE]", {
      confidence,
      textLength: rawText.length,
      lines: lines.length,
      overlayLines: overlay.length,
      ocrLanguage,
      ocrEngine,
      viaSignedUrl: Boolean(debugUpload?.signedUrl),
    });

    await setOcrCache(
      fileHash,
      {
        rawText,
        confidence,
        engine: "ocr_space",
        rawResponse: truncateRawOcrResponse(rawApiResponse),
      },
      { fileName, mimeType },
    );

    return {
      text: rawText,
      engine: "ocr_space",
      confidence,
      pdfPageCount,
      overlay,
      lines,
      ocrLanguage,
      ocrEngine,
    };
  } catch (e) {
    console.error("[OCR] OCR errors:", e instanceof Error ? e.message : e);
    if (e instanceof OcrServiceError) throw e;
    const msg = e instanceof Error ? e.message : "OCR.space failed";
    throw new OcrServiceError("OCR_PROVIDER_ERROR", msg);
  }
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
