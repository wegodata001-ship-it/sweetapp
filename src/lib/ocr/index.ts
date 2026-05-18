import { googleVisionConfigured, runGoogleVisionOcr } from "./google-vision";
import { extractTextFromDocument, hasMeaningfulText } from "./extract-text";
import { parseReceiptText } from "./parser";
import { enrichScannedDocument } from "./matcher";
import { uploadReceiptToStorage } from "./storage";
import { timeStep } from "./timing";
import type { ScannedDocument } from "./types";

export * from "./types";
export { parseReceiptText } from "./parser";
export { enrichScannedDocument } from "./matcher";
export { googleVisionConfigured } from "./google-vision";
export { preprocessForOcr } from "./extract-text";

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "application/pdf",
] as const;

export function isSupportedMimeType(m: string): boolean {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(m);
}

function hasExtractedFields(doc: ScannedDocument): boolean {
  return Boolean(
    doc.supplierRawName?.trim() ||
    doc.invoiceNumber?.trim() ||
    doc.date ||
    (doc.total != null && doc.total > 0) ||
    doc.items.length > 0,
  );
}

/**
 * Upload + OCR in parallel where possible; parse + match after.
 */
export async function scanDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<ScannedDocument & { error?: string }> {
  const { buffer, fileName, mimeType } = input;

  let upload: { url: string; path: string } | null = null;
  let rawText = "";
  let engine = "manual";
  let confidence = 0;

  const [uploadResult, ocrResult] = await Promise.all([
    timeStep("ocr:upload", () => uploadReceiptToStorage(buffer, fileName, mimeType)),
    extractTextFromDocument(buffer, mimeType),
  ]);
  upload = uploadResult;
  rawText = ocrResult.text;
  engine = ocrResult.engine;
  confidence = ocrResult.confidence;

  let error: string | undefined;

  if (!hasMeaningfulText(rawText) && googleVisionConfigured()) {
    try {
      const gv = await timeStep("vision-fallback", () =>
        runGoogleVisionOcr(buffer, mimeType),
      );
      if (hasMeaningfulText(gv.text) || gv.text.length > rawText.length) {
        rawText = gv.text;
        engine = gv.engine;
        confidence = Math.max(confidence, gv.confidence);
      }
    } catch (e) {
      console.warn("[scanDocument] Vision fallback failed", e);
    }
  }

  const parsed = await timeStep("parse", async () => parseReceiptText(rawText));
  parsed.engine = engine;
  parsed.confidence = Math.max(parsed.confidence, confidence);
  parsed.receiptFileUrl = upload?.url ?? null;
  parsed.receiptFileName = fileName;

  if (!hasMeaningfulText(rawText) && !hasExtractedFields(parsed)) {
    error = "OCR_READ_FAILED";
  }

  try {
    const enriched = await timeStep("match", () => enrichScannedDocument(parsed));
    return { ...enriched, error };
  } catch (e) {
    console.error("[scanDocument] enrich failed", e);
    return { ...parsed, error: error ?? "OCR_PARTIAL" };
  }
}
