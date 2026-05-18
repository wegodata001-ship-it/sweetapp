import { ocrSpaceConfigured } from "./ocr-space";
import { extractTextFromDocument, hasMeaningfulText } from "./extract-text";
import { OcrServiceError } from "./ocr-errors";
import { parseReceiptText, summarizeParsed } from "./parser";
import { enrichScannedDocument } from "./matcher";
import { uploadReceiptToStorage } from "./storage";
import type { ScanDebugMeta } from "./api-response";
import type { ScannedDocument } from "./types";

export * from "./types";
export { parseReceiptText, summarizeParsed } from "./parser";
export { enrichScannedDocument } from "./matcher";
export { ocrSpaceConfigured } from "./ocr-space";
export type { OcrSpaceResult } from "./ocr-space";
export { confidenceTier } from "./confidence-ui";
export type { ScanDebugMeta } from "./api-response";

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

function emptyScannedDocument(fileName: string): ScannedDocument {
  return {
    supplierRawName: "",
    supplierName: "",
    invoiceNumber: "",
    date: "",
    items: [],
    rawText: "",
    receiptFileName: fileName,
    engine: "ocr_space",
    confidence: 0,
  };
}

export type ScanDocumentResult = ScannedDocument & {
  error?: string;
  partial?: boolean;
  debug?: ScanDebugMeta;
};

/**
 * Upload → OCR.space → parse → supplier/product match.
 */
export async function scanDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<ScanDocumentResult> {
  const { buffer, fileName, mimeType } = input;

  if (!ocrSpaceConfigured()) {
    return {
      ...emptyScannedDocument(fileName),
      error: "OCR_NOT_CONFIGURED",
    };
  }

  let upload: { url: string; path: string } | null = null;
  let rawText = "";
  let engine = "ocr_space";
  let confidence = 0;

  const uploadStart = Date.now();
  const ocrPipelineStart = Date.now();

  const [uploadResult, ocrResult] = await Promise.all([
    uploadReceiptToStorage(buffer, fileName, mimeType).then((r) => {
      console.log("[OCR] upload duration ms:", Date.now() - uploadStart);
      return r;
    }),
    extractTextFromDocument(buffer, mimeType, fileName).then((r) => {
      console.log("[OCR] ocr pipeline duration ms:", Date.now() - ocrPipelineStart);
      return r;
    }),
  ]);

  upload = uploadResult;
  rawText = ocrResult.text;
  engine = ocrResult.engine;
  confidence = ocrResult.confidence;
  const ocrFromCache = engine.includes("_cache");

  console.log("[OCR] RAW TEXT:", rawText);
  console.log("[OCR] RAW TEXT length:", rawText.length, "engine:", engine);

  let error: string | undefined;

  const parseStart = Date.now();
  const parsed = parseReceiptText(rawText);
  const parseDurationMs = Date.now() - parseStart;

  console.log("[OCR] PARSED RESULT:", JSON.stringify(summarizeParsed(parsed)));
  console.log("[OCR] OCR parse duration ms:", parseDurationMs);

  parsed.engine = engine;
  parsed.confidence = Math.max(parsed.confidence, confidence);
  parsed.receiptFileUrl = upload?.url ?? null;
  parsed.receiptFileName = fileName;
  parsed.rawText = rawText;
  parsed.ocrFromCache = ocrFromCache;

  if (!hasMeaningfulText(rawText) && !hasExtractedFields(parsed)) {
    error = "OCR_READ_FAILED";
  }

  const matchStart = Date.now();
  let enriched: ScannedDocument;
  try {
    enriched = await enrichScannedDocument(parsed);
    console.log("[OCR] ENRICHED RESULT:", JSON.stringify(summarizeParsed(enriched)));
    console.log("[OCR] match duration ms:", Date.now() - matchStart);
  } catch (e) {
    console.error("[scanDocument] enrich failed", e);
    enriched = parsed;
    error = error ?? "OCR_PARTIAL";
  }

  const partial =
    !enriched.supplierId &&
    hasExtractedFields(enriched) &&
    Boolean(enriched.supplierRawName?.trim() || enriched.items.length > 0);

  if (partial && !error) {
    error = "OCR_PARTIAL";
  }

  const debug: ScanDebugMeta = {
    provider: "ocr.space",
    confidence: enriched.confidence,
    textLength: rawText.length,
    itemsFound: enriched.items.length,
    parseDurationMs,
    ocrEngine: engine,
    fromCache: ocrFromCache,
    partial,
  };

  return { ...enriched, error, partial, debug };
}

export { OcrServiceError };
