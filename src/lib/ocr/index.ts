import { anyOcrConfigured, logActiveOcrProvider } from "./ocr-provider";
import { extractTextFromDocument, hasMeaningfulText } from "./extract-text";
import { OcrServiceError } from "./ocr-errors";
import { parseReceiptText, summarizeParsed } from "./parser";
import { enrichScannedDocument } from "./matcher";
import { applyTotalValidation } from "./validate-document-totals";
import { uploadReceiptToStorage } from "./storage";
import type { ScanDebugMeta } from "./api-response";
import type { ScannedDocument } from "./types";
import { writeOcrDebugSnapshot } from "./ocr-debug";
import { hashFileBuffer, clearAllOcrCache } from "./ocr-cache";
import { getOcrProvider, logOcrFlow } from "./ocr-flow";
import { computeGarbageRatio } from "./ocr-quality";
import { isLayoutOnlyMode, type OcrProviderActive } from "./ocr-hard-verify";

export * from "./types";
export { parseReceiptText, summarizeParsed } from "./parser";
export { parseHebrewInvoiceTable } from "./hebrew-invoice-table-parser";
export { enrichScannedDocument } from "./matcher";
export { ocrSpaceConfigured } from "./ocr-space";
export { googleVisionConfigured } from "./google-vision";
export { anyOcrConfigured, resolveOcrProvider } from "./ocr-provider";
export type { OcrSpaceResult } from "./ocr-space";
export { confidenceTier } from "./confidence-ui";
export type { ScanDebugMeta } from "./api-response";
export { getOcrProvider, logOcrFlow } from "./ocr-flow";
export { parseStructuredInvoice } from "./structured-invoice-parser";
export { parseInvoiceByLayout } from "./invoice-layout-engine";
export { clearAllOcrCache } from "./ocr-cache";
export {
  isGoogleOnlyMode,
  isLayoutOnlyMode,
  googleVisionApiKeyPresent,
} from "./ocr-hard-verify";

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
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
    engine: getOcrProvider(),
    confidence: 0,
  };
}

export type ScanDocumentResult = ScannedDocument & {
  error?: string;
  partial?: boolean;
  debug?: ScanDebugMeta;
};

/**
 * Upload → OCR (Google Vision / OCR.space) → RTL normalize → parse → match.
 */
export async function scanDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileHash?: string;
}): Promise<ScanDocumentResult> {
  const { buffer, fileName, mimeType } = input;
  const fileHash = input.fileHash ?? hashFileBuffer(buffer);
  logOcrFlow({ phase: "start", fileName, mimeType, bytes: buffer.length });

  if (!anyOcrConfigured()) {
    return {
      ...emptyScannedDocument(fileName),
      error: "OCR_NOT_CONFIGURED",
    };
  }

  const provider = logActiveOcrProvider();
  console.log("OCR PROVIDER ACTIVE:", provider);

  let upload: { url: string; path: string } | null = null;
  let rawText = "";
  let engine: string = provider;
  let confidence = 0;
  let ocrLanguage = "unknown";
  let ocrEngineUsed: string = provider;

  const uploadStart = Date.now();
  const ocrPipelineStart = Date.now();

  let ocrInputMode: ScanDebugMeta["ocrInputMode"] = "preprocessed";

  const [uploadResult, ocrResult] = await Promise.all([
    uploadReceiptToStorage(buffer, fileName, mimeType).then((r) => {
      console.log("[OCR] upload duration ms:", Date.now() - uploadStart);
      return r;
    }),
    extractTextFromDocument(buffer, mimeType, fileName, {
      fileHash,
      route: "scanDocument",
      clearCacheFirst: true,
      onOcrInputMode: (mode) => {
        ocrInputMode = mode;
      },
    }).then((r) => {
      console.log("[OCR] ocr pipeline duration ms:", Date.now() - ocrPipelineStart);
      return r;
    }),
  ]);

  upload = uploadResult;
  rawText = ocrResult.text;
  engine = ocrResult.engine;
  confidence = ocrResult.confidence;
  ocrLanguage = ocrResult.ocrLanguage ?? "unknown";
  ocrEngineUsed = ocrResult.ocrEngine ?? provider;
  const ocrFromCache = engine.includes("_cache");
  const pdfPageCount = ocrResult.pdfPageCount;
  const overlay = ocrResult.overlay ?? [];
  const needsOcrReview = ocrResult.needsManualReview ?? false;

  console.log("[OCR RAW TEXT]\n", rawText);
  console.log("[OCR RAW LINES]");
  console.dir(
    ocrResult.lines?.slice(0, 40) ?? rawText.split("\n").slice(0, 40),
    { depth: 2 },
  );

  let error: string | undefined;

  const parseStart = Date.now();
  console.log("[PARSER] START overlay:", overlay.length);
  const parsed = applyTotalValidation(
    parseReceiptText(rawText, { overlay }),
  );
  const parseDurationMs = Date.now() - parseStart;
  console.log("[PARSER] DONE ms:", parseDurationMs);
  console.log("[OCR PARSED RESULT]");
  console.dir(summarizeParsed(parsed), { depth: 4 });

  parsed.engine = engine;
  parsed.confidence = Math.max(parsed.confidence, confidence);
  parsed.receiptFileUrl = upload?.url ?? null;
  parsed.receiptFileName = fileName;
  parsed.ocrFromCache = ocrFromCache;

  if (needsOcrReview) {
    const fields = new Set(parsed.needsReviewFields ?? []);
    fields.add("ocr_quality");
    parsed.needsReviewFields = [...fields];
    parsed.confidence = Math.min(parsed.confidence, 0.45);
  }

  if (!hasMeaningfulText(rawText) && !hasExtractedFields(parsed)) {
    error = "OCR_READ_FAILED";
  } else if (needsOcrReview && !error) {
    error = "OCR_PARTIAL";
  }

  const matchStart = Date.now();
  console.log("[MATCHER] START");
  let enriched: ScannedDocument;
  try {
    enriched = applyTotalValidation(await enrichScannedDocument(parsed));
    console.log("[MATCHER] DONE ms:", Date.now() - matchStart);
    console.log("[OCR ENRICHED RESULT]");
    console.dir(summarizeParsed(enriched), { depth: 4 });
  } catch (e) {
    console.error("[scanDocument] enrich failed", e);
    enriched = parsed;
    error = error ?? "OCR_PARTIAL";
  }

  if (needsOcrReview) {
    const fields = new Set(enriched.needsReviewFields ?? []);
    fields.add("ocr_quality");
    enriched.needsReviewFields = [...fields];
  }

  const partial =
    needsOcrReview ||
    (!enriched.supplierId &&
      hasExtractedFields(enriched) &&
      Boolean(enriched.supplierRawName?.trim() || enriched.items.length > 0));

  if (partial && !error) {
    error = "OCR_PARTIAL";
  }

  const parseMeta = (
    parsed as ScannedDocument & {
      parseMeta?: {
        parseSource?: string;
        headerFound?: boolean;
        columnBands?: ScanDebugMeta["columnBands"];
        overlayLineCount?: number;
        invoiceKind?: "expense" | "credit";
        needsReviewFields?: string[];
      };
    }
  ).parseMeta;

  const ocrProviderActive: OcrProviderActive =
    ocrResult.ocrProviderActive ??
    (provider === "google_vision" ? "google_vision" : "ocr_space");

  const debug: ScanDebugMeta = {
    provider: ocrProviderActive,
    ocrProviderActive,
    fileHash,
    fileSizeBytes: buffer.length,
    ocrInputMode,
    confidence: enriched.confidence,
    ocrConfidence: confidence,
    textLength: rawText.length,
    itemsFound: enriched.items.length,
    parseDurationMs,
    ocrEngine: engine,
    ocrLanguage,
    ocrEngineNumber: ocrEngineUsed,
    fromCache: ocrFromCache,
    partial,
    totalSuspect: enriched.totalSuspect,
    itemsSumDetected: enriched.itemsSumDetected,
    pdfPageCount,
    overlayLineCount: overlay.length,
    parseSource: parseMeta?.parseSource,
    invoiceKind: parseMeta?.invoiceKind ?? parsed.invoiceKind,
    needsReviewFields: enriched.needsReviewFields,
    headerFound: parseMeta?.headerFound,
    columnBands: parseMeta?.columnBands,
    overlayLinesPreview: overlay.slice(0, 25).map((l) => ({
      text: l.text,
      top: l.top,
      wordCount: l.words.length,
    })),
    blockCount: ocrResult.blockCount,
    pageCount: ocrResult.pageCount,
    detectedLanguages: ocrResult.detectedLanguages,
    needsManualReview: needsOcrReview,
    rawOcrPreview: ocrResult.rawTextPreview ?? rawText.slice(0, 2000),
    garbageRatio: computeGarbageRatio(rawText),
    visionWordsSample: ocrResult.visionWordsSample,
    layoutOnlyMode: isLayoutOnlyMode(),
    firstOverlayLines: overlay.slice(0, 10).map((l) => l.text),
  };

  void writeOcrDebugSnapshot({
    provider,
    ocrLanguage,
    ocrEngine: ocrEngineUsed,
    fromCache: ocrFromCache,
    rawText,
    overlayLineCount: overlay.length,
    overlayLines: overlay.slice(0, 40).map((l) => ({
      text: l.text,
      top: l.top,
      wordCount: l.words.length,
    })),
    parsedItems: enriched.items,
    columnBands: parseMeta?.columnBands,
    headerFound: parseMeta?.headerFound,
    parseSource: parseMeta?.parseSource,
    blockCount: ocrResult.blockCount,
    detectedLanguages: ocrResult.detectedLanguages,
  }).catch((e) => console.warn("[OCR DEBUG] write failed", e));

  console.log("[OCR] RESPONSE", { partial, error: error ?? null, debug });

  return { ...enriched, error, partial, debug };
}

export { OcrServiceError };
