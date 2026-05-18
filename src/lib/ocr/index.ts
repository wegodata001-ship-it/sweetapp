import { googleVisionConfigured, runGoogleVisionOcr } from "./google-vision";
import { extractTextFromDocument, hasMeaningfulText } from "./extract-text";
import { parseReceiptText } from "./parser";
import { enrichScannedDocument } from "./matcher";
import { uploadReceiptToStorage } from "./storage";
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
 * תזרים → הוצאות: העלאה → OCR מקומי (pdf-parse / tesseract) → פרסור → התאמת ספק/מחירים → תצוגה לעריכה (לא שמירה אוטומטית).
 */
export async function scanDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<ScannedDocument & { error?: string }> {
  const { buffer, fileName, mimeType } = input;

  const upload = await uploadReceiptToStorage(buffer, fileName, mimeType);

  let rawText = "";
  let engine = "manual";
  let confidence = 0;
  let error: string | undefined;

  try {
    const local = await extractTextFromDocument(buffer, mimeType);
    rawText = local.text;
    engine = local.engine;
    confidence = local.confidence;

    if (!hasMeaningfulText(rawText) && googleVisionConfigured()) {
      console.log("[OCR] Local OCR weak — trying Google Vision fallback");
      try {
        const gv = await runGoogleVisionOcr(buffer, mimeType);
        if (hasMeaningfulText(gv.text) || gv.text.length > rawText.length) {
          rawText = gv.text;
          engine = gv.engine;
          confidence = Math.max(confidence, gv.confidence);
          console.log("[OCR] Vision text length:", rawText.length);
        }
      } catch (e) {
        console.warn("[scanDocument] Vision fallback failed", e);
      }
    }
  } catch (e) {
    console.error("[scanDocument] extract failed", e instanceof Error ? e.message : e);
  }

  const parsed = parseReceiptText(rawText);
  parsed.engine = engine;
  parsed.confidence = Math.max(parsed.confidence, confidence);
  parsed.receiptFileUrl = upload?.url ?? null;
  parsed.receiptFileName = fileName;

  const textOk = hasMeaningfulText(rawText);
  const fieldsOk = hasExtractedFields(parsed);
  console.log("[OCR] textOk:", textOk, "fieldsOk:", fieldsOk, "engine:", engine);

  if (!textOk && !fieldsOk) {
    error = "OCR_READ_FAILED";
  }

  const enriched = await enrichScannedDocument(parsed);
  return { ...enriched, error };
}
