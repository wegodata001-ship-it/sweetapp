import type { ScanDebugMeta } from "./api-response";
import type { ScannedDocument, ScannedItem } from "./api-response";
import { hashFileBuffer } from "./file-utils";
import { isGeminiVisionConfigured, type GeminiInvoiceJson } from "./gemini-vision";
import { scanInvoiceWithGemini } from "./scan-invoice-with-gemini";
import { prepareScanInput } from "./prepare-scan-input";
import { ScanServiceError } from "./scan-errors";
import { logScanEnv } from "./scan-env";
import { uploadScanSourceFile, type ScanUploadResult } from "./storage";
import { assertBucketExists, sourceFilesBucketName, STORAGE_BUCKET_MISSING } from "@/lib/storage/buckets";
import { scanReadyForConfirm } from "./parse-fields";
import { documentScanToLegacy } from "./to-legacy";
import type { DocumentScanFields, IntakeMode } from "./types";
import {
  buildMoneyField,
  buildStringField,
  formatDisplayDate,
  formatShekelDisplay,
} from "./field-builders";
import { getScanCache, saveScanCache, scanCacheKey } from "./scan-cache";
import type { ScanProgressCallback } from "./scan-progress";
import { geminiModelName } from "./gemini-client";
import { enrichExpenseSupplierScan } from "@/lib/procurement/enrich-expense-supplier-scan";

export * from "./types";
export { documentScanToLegacy } from "./to-legacy";
export {
  buildStringField,
  buildMoneyField,
  formatDisplayDate,
  formatShekelDisplay,
  tierFromScore,
} from "./field-builders";
export { scanReadyForConfirm } from "./parse-fields";

export type ScanDocumentInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileHash?: string;
  intakeMode?: IntakeMode;
  onProgress?: ScanProgressCallback;
  /** השוואת מחירים מול מחירון ספק — רק להוצאות */
  compareSupplierPrices?: boolean;
};

export type ScanDocumentOutput = ReturnType<typeof documentScanToLegacy> & {
  error?: string;
  partial?: boolean;
  debug?: ScanDebugMeta;
};

function validateRequiredFields(fields: DocumentScanFields): {
  ok: boolean;
  detectedCount: number;
  missingFields: string[];
} {
  const required = [
    ["supplier", fields.supplier.detected],
    ["date", fields.date.detected],
    ["total", fields.total.detected],
  ] as const;
  const missingFields = required
    .filter(([, detected]) => !detected)
    .map(([field]) => field);
  return {
    ok: missingFields.length === 0,
    detectedCount: required.length - missingFields.length,
    missingFields,
  };
}

function normalizeGeminiDate(date: string | null): { value: string | null; display: string | null } {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { value: null, display: null };
  return { value: date, display: formatDisplayDate(date) };
}

function fieldsFromGemini(invoice: GeminiInvoiceJson): DocumentScanFields {
  const date = normalizeGeminiDate(invoice.date);
  const dateField = buildStringField(date.display, date.value ? 0.96 : 0);

  return {
    supplier: buildStringField(invoice.supplier, invoice.supplier ? 0.96 : 0),
    date: dateField.detected && date.value ? { ...dateField, value: date.value } : dateField,
    invoiceNumber: buildStringField(invoice.invoiceNumber, invoice.invoiceNumber ? 0.96 : 0),
    vatId: buildStringField(null, 0),
    subtotal: buildMoneyField(invoice.subtotal, invoice.subtotal != null ? 0.94 : 0, formatShekelDisplay),
    vat: buildMoneyField(invoice.vat, invoice.vat != null ? 0.94 : 0, formatShekelDisplay),
    total: buildMoneyField(invoice.total, invoice.total != null ? 0.96 : 0, formatShekelDisplay),
    documentType: buildStringField(invoice.documentType, invoice.documentType ? 0.9 : 0),
  };
}

function itemsFromGemini(invoice: GeminiInvoiceJson): ScannedDocument["items"] {
  return invoice.lineItems
    .map((item): ScannedItem | null => {
      const name = item.name?.trim() ?? "";
      const quantity = item.quantity ?? 1;
      const unitPrice = item.unitPrice ?? (item.lineTotal != null ? item.lineTotal / quantity : 0);
      const lineTotal = item.lineTotal ?? unitPrice * quantity;
      if (!name || !Number.isFinite(quantity) || !Number.isFinite(unitPrice) || !Number.isFinite(lineTotal)) {
        return null;
      }
      if (quantity <= 0 || unitPrice < 0 || lineTotal <= 0) return null;
      return {
        rawName: name,
        name,
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        lineTotal: Math.round(lineTotal * 100) / 100,
        confidenceScore: 0.86,
        parseConfidence: 0.86,
        lineStatus: "review" as const,
        uncertain: false,
      };
    })
    .filter((item): item is ScannedItem => item != null);
}

/**
 * Upload → Preprocess → Gemini AI → Parse → Fill form
 */
async function runDocumentScan(input: ScanDocumentInput): Promise<ScanDocumentOutput> {
  const { buffer, fileName, mimeType, onProgress } = input;
  const fileHash = input.fileHash ?? hashFileBuffer(buffer);
  const intakeMode = input.intakeMode ?? "quick";
  const cacheKey = scanCacheKey(fileHash, "invoice", intakeMode);

  console.log("SCAN_START", { fileName, mimeType, bytes: buffer.length, engine: "gemini_vision", cacheKey });
  logScanEnv();

  if (!isGeminiVisionConfigured()) {
    throw new ScanServiceError("SCAN_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
  }

  try {
    await assertBucketExists(sourceFilesBucketName());
  } catch (e) {
    if (e instanceof Error && e.message === STORAGE_BUCKET_MISSING) {
      throw new ScanServiceError("SCAN_PROVIDER_ERROR", STORAGE_BUCKET_MISSING);
    }
    throw e;
  }

  onProgress?.("upload");
  console.log("UPLOAD_START");
  const uploadStart = Date.now();
  const preprocessStart = Date.now();

  let uploadResult: ScanUploadResult | null = null;
  let prepared: Awaited<ReturnType<typeof prepareScanInput>>;

  try {
    [uploadResult, prepared] = await Promise.all([
      (async () => {
        const saveStart = Date.now();
        const result = await uploadScanSourceFile(buffer, fileName, mimeType);
        console.log("SAVE_EXPENSE_MS", Date.now() - saveStart, { stored: Boolean(result?.storagePath) });
        return result;
      })(),
      prepareScanInput(buffer, mimeType, fileName),
    ]);
  } catch (e) {
    console.error("[DOCUMENT_SCAN] UPLOAD_START failed", e);
    throw e;
  }

  onProgress?.("preprocess");
  console.log("UPLOAD_DONE", {
    uploadMs: Date.now() - uploadStart,
    preprocessMs: Date.now() - preprocessStart,
    stored: Boolean(uploadResult?.storagePath),
    bucket: uploadResult?.bucket ?? sourceFilesBucketName(),
    preparedBytes: prepared.buffer.length,
    preparedMime: prepared.mimeType,
  });

  type CachedGemini = {
    invoice: GeminiInvoiceJson;
    rawResponse: string;
    confidence: number;
    model: string;
  };

  onProgress?.("ai");
  let geminiResult: CachedGemini;
  let fromCache = false;

  const cached = await getScanCache<CachedGemini>(cacheKey);
  if (cached?.invoice) {
    geminiResult = cached;
    fromCache = true;
    console.log("GEMINI_REQUEST_MS", 0, { fromCache: true });
    console.log("GEMINI_RESPONSE_MS", 0, { fromCache: true });
  } else {
    const geminiStart = Date.now();
    const fresh = await scanInvoiceWithGemini(prepared, intakeMode);
    console.log("GEMINI_TOTAL_MS", Date.now() - geminiStart, { scanPath: fresh.scanPath });
    geminiResult = {
      invoice: fresh.invoice,
      rawResponse: fresh.rawResponse,
      confidence: fresh.confidence,
      model: fresh.model,
    };
    const cacheStart = Date.now();
    await saveScanCache({
      cacheKey,
      kind: "invoice",
      intakeMode,
      fileName,
      mimeType,
      payload: geminiResult,
      confidence: fresh.confidence,
      rawResponse: fresh.rawResponse,
    });
    console.log("SAVE_EXPENSE_MS", Date.now() - cacheStart, { step: "scan_cache" });
  }

  onProgress?.("parse");
  const parseStart = Date.now();
  const fields = fieldsFromGemini(geminiResult.invoice);
  const items = itemsFromGemini(geminiResult.invoice);
  const parseDurationMs = Date.now() - parseStart;
  const validation = validateRequiredFields(fields);

  const legacy = documentScanToLegacy(fields, {
    rawText: JSON.stringify(geminiResult.invoice),
    fileName: uploadResult?.fileName ?? fileName,
    engine: "gemini_vision",
    aiConfidence: geminiResult.confidence,
    intakeMode,
    receiptFileUrl: uploadResult?.viewUrl ?? null,
    receiptStoragePath: uploadResult?.storagePath ?? null,
    receiptStorageBucket: uploadResult?.bucket ?? null,
    receiptMimeType: uploadResult?.fileType ?? mimeType,
    items,
    fromAiCache: fromCache,
  });

  let scanResult = legacy as ScannedDocument & typeof legacy;
  if (input.compareSupplierPrices) {
    scanResult = await enrichExpenseSupplierScan(scanResult);
    console.log("[SCAN_ENRICH] supplier price compare", {
      supplierId: scanResult.supplierId,
      summary: scanResult.priceCompareSummary,
    });
  }

  let error: string | undefined;
  if (!validation.ok) {
    error = "SCAN_READ_FAILED";
  } else if (!scanReadyForConfirm(fields)) {
    error = "SCAN_PARTIAL";
  }

  const partial = Boolean(error === "SCAN_PARTIAL");

  const debug: ScanDebugMeta = {
    provider: "gemini_vision",
    aiProviderActive: "gemini_vision",
    geminiVisionProvider: "gemini_vision",
    geminiModel: geminiResult.model ?? geminiModelName(),
    aiModel: geminiResult.model ?? geminiModelName(),
    aiEngine: "gemini_vision",
    fileHash,
    fileSizeBytes: buffer.length,
    inputMode: prepared.scanMode === "pdf_native" ? "pdf_native" : "preprocessed",
    pdfPageCount: prepared.pdfPageCount,
    fromCache,
    confidence: scanResult.confidence,
    textLength: JSON.stringify(geminiResult.invoice).length,
    itemsFound: scanResult.items.length,
    parseDurationMs,
    partial,
    needsReviewFields: scanResult.needsReviewFields,
    needsManualReview: !validation.ok,
    rawAiPreview: JSON.stringify(geminiResult.invoice).slice(0, 2000),
    aiRawResponsePreview: geminiResult.rawResponse.slice(0, 4000),
    geminiStructuredJson: geminiResult.invoice,
    validation,
    mappedFields: {
      supplier: fields.supplier.value ?? "",
      invoiceNumber: fields.invoiceNumber.value ?? "",
      date: fields.date.value ?? "",
      total: fields.total.value,
      vat: fields.vat.value,
      documentType: fields.documentType.value ?? "",
    },
    parseQualityOk: scanResult.parseQualityOk,
    parseQualityIssues: scanResult.parseQualityIssues,
  };

  if (error === "SCAN_READ_FAILED") {
    console.warn("[DOCUMENT_SCAN_FAILED]", { validation, provider: "gemini_vision" });
  }

  return { ...scanResult, error, partial, debug };
}

export async function scanDocument(input: ScanDocumentInput): Promise<ScanDocumentOutput> {
  return runDocumentScan(input);
}

export {
  isSupportedMimeType,
  SUPPORTED_MIME_TYPES,
  hashFileBuffer,
  resolveUploadMimeType,
  bufferFromUploadFile,
} from "./file-utils";
export { ScanServiceError, SCAN_BUSY_USER_MESSAGE, SCAN_TIMEOUT_USER_MESSAGE } from "./scan-errors";
export { scanJsonSuccess, scanJsonError } from "./api-response";
export type { ScannedDocument, ScannedItem, ScanDebugMeta } from "./api-response";
