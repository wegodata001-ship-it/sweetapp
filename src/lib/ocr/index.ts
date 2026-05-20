import { ocrSpaceConfigured } from "./ocr-space";
import { extractTextFromDocument, hasMeaningfulText } from "./extract-text";
import { OcrServiceError } from "./ocr-errors";
import { parseReceiptText, summarizeParsed } from "./parser";
import { enrichScannedDocument } from "./matcher";
import { applyTotalValidation } from "./validate-document-totals";
import { uploadReceiptToStorage } from "./storage";
import type { ScanDebugMeta } from "./api-response";
import type { ScannedDocument } from "./types";
import { writeOcrDebugSnapshot } from "./ocr-debug";
import { hashFileBuffer } from "./ocr-cache";
import { logOcrFlow, OCR_PROVIDER } from "./ocr-flow";

export * from "./types";
export { parseReceiptText, summarizeParsed } from "./parser";
export { parseHebrewInvoiceTable } from "./hebrew-invoice-table-parser";
export { enrichScannedDocument } from "./matcher";
export { ocrSpaceConfigured } from "./ocr-space";
export type { OcrSpaceResult } from "./ocr-space";
export { confidenceTier } from "./confidence-ui";
export type { ScanDebugMeta } from "./api-response";
export { OCR_PROVIDER, logOcrFlow } from "./ocr-flow";
export { parseStructuredInvoice } from "./structured-invoice-parser";

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
  fileHash?: string;
}): Promise<ScanDocumentResult> {
  const { buffer, fileName, mimeType } = input;
  const fileHash = input.fileHash ?? hashFileBuffer(buffer);

  logOcrFlow({ phase: "start", fileName, mimeType, bytes: buffer.length });
  console.log("[OCR PROVIDER]", OCR_PROVIDER);

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
  let ocrLanguage = "unknown";
  let ocrEngineUsed = "1";

  const uploadStart = Date.now();
  const ocrPipelineStart = Date.now();

  let ocrInputMode: ScanDebugMeta["ocrInputMode"] = "direct_buffer";

  const [uploadResult, ocrResult] = await Promise.all([
    uploadReceiptToStorage(buffer, fileName, mimeType).then((r) => {
      console.log("[OCR] upload duration ms:", Date.now() - uploadStart);
      return r;
    }),
    extractTextFromDocument(buffer, mimeType, fileName, {
      fileHash,
      route: "scanDocument",
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
  ocrEngineUsed = ocrResult.ocrEngine ?? "1";
  const ocrFromCache = engine.includes("_cache");
  const pdfPageCount = ocrResult.pdfPageCount;
  const overlay = ocrResult.overlay ?? [];

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
  parsed.rawText = rawText;
  parsed.ocrFromCache = ocrFromCache;

  if (!hasMeaningfulText(rawText) && !hasExtractedFields(parsed)) {
    error = "OCR_READ_FAILED";
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

  const partial =
    !enriched.supplierId &&
    hasExtractedFields(enriched) &&
    Boolean(enriched.supplierRawName?.trim() || enriched.items.length > 0);

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

  const debug: ScanDebugMeta = {
    provider: OCR_PROVIDER,
    fileHash,
    fileSizeBytes: buffer.length,
    ocrInputMode,
    confidence: enriched.confidence,
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
    needsReviewFields: parseMeta?.needsReviewFields ?? parsed.needsReviewFields,
    headerFound: parseMeta?.headerFound,
    columnBands: parseMeta?.columnBands,
    overlayLinesPreview: overlay.slice(0, 25).map((l) => ({
      text: l.text,
      top: l.top,
      wordCount: l.words.length,
    })),
  };

  void writeOcrDebugSnapshot({
    provider: OCR_PROVIDER,
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
  }).catch((e) => console.warn("[OCR DEBUG] write failed", e));

  console.log("[OCR] RESPONSE", { partial, error: error ?? null, debug });

  return { ...enriched, error, partial, debug };
}

export { OcrServiceError };
