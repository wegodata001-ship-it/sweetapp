import { hashFileBuffer } from "./file-utils";
import { prepareScanInput } from "./prepare-scan-input";
import { ScanServiceError } from "./scan-errors";
import { isGeminiVisionConfigured } from "./gemini-vision";
import type { GeminiZReportJson } from "./gemini-z-report";
import { scanZReportWithGemini } from "./scan-z-report-with-gemini";
import { uploadScanSourceFile } from "./storage";
import { assertBucketExists, sourceFilesBucketName, STORAGE_BUCKET_MISSING } from "@/lib/storage/buckets";
import { getScanCache, saveScanCache, scanCacheKey } from "./scan-cache";
import type { ScanProgressCallback } from "./scan-progress";
import {
  buildStringField,
  formatDisplayDate,
  formatShekelDisplay,
  tierFromScore,
} from "./field-builders";
import type { ScannedField } from "./types";
import type { ScannedZReportDto, ZReportScanFields } from "./z-report-types";

export type { ScannedZReportDto, ZReportScanFields } from "./z-report-types";

function buildZAmountField(value: number | null | undefined, score: number): ScannedField<number> {
  const tier = tierFromScore(score);
  if (value == null || !Number.isFinite(value) || value < 0 || tier === "none" || tier === "low") {
    return {
      value: null,
      display: "לא זוהה",
      confidence: tier === "low" ? "low" : "none",
      confidencePercent: value != null && value >= 0 ? Math.round(score * 100) : null,
      detected: false,
    };
  }
  return {
    value,
    display: formatShekelDisplay(value),
    confidence: tier,
    confidencePercent: Math.round(score * 100),
    detected: true,
  };
}

function normalizeGeminiDate(date: string | null): { value: string | null; display: string | null } {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { value: null, display: null };
  return { value: date, display: formatDisplayDate(date) };
}

function fieldsFromGeminiZReport(z: GeminiZReportJson): ZReportScanFields {
  const date = normalizeGeminiDate(z.date);
  const dateField = buildStringField(date.display, date.value ? 0.96 : 0);

  return {
    zNumber: buildStringField(z.zNumber, z.zNumber ? 0.96 : 0),
    date: dateField.detected && date.value ? { ...dateField, value: date.value } : dateField,
    cashTaxable: buildZAmountField(z.cashTaxable, z.cashTaxable != null ? 0.94 : 0),
    cashExempt: buildZAmountField(z.cashExempt, z.cashExempt != null ? 0.94 : 0),
    creditTaxable: buildZAmountField(z.creditTaxable, z.creditTaxable != null ? 0.94 : 0),
    creditExempt: buildZAmountField(z.creditExempt, z.creditExempt != null ? 0.94 : 0),
    transfers: buildZAmountField(z.transfers, z.transfers != null ? 0.94 : 0),
    grandTotal: buildZAmountField(z.grandTotal, z.grandTotal != null ? 0.96 : 0),
  };
}

function sumParts(fields: ZReportScanFields): number {
  return (
    (fields.cashTaxable.value ?? 0) +
    (fields.cashExempt.value ?? 0) +
    (fields.creditTaxable.value ?? 0) +
    (fields.creditExempt.value ?? 0) +
    (fields.transfers.value ?? 0)
  );
}

function validateZReportFields(fields: ZReportScanFields): {
  ok: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];
  if (!fields.zNumber.detected) missingFields.push("zNumber");
  if (!fields.date.detected) missingFields.push("date");
  const hasTotal = fields.grandTotal.detected || sumParts(fields) > 0;
  if (!hasTotal) missingFields.push("grandTotal");
  return { ok: missingFields.length === 0, missingFields };
}

function zReportReadyForConfirm(fields: ZReportScanFields): boolean {
  return validateZReportFields(fields).ok;
}

function toDto(
  fields: ZReportScanFields,
  meta: {
    receiptFileUrl?: string | null;
    receiptFileName?: string | null;
    receiptStoragePath?: string | null;
    receiptStorageBucket?: string | null;
    receiptMimeType?: string | null;
    confidence: number;
  },
): ScannedZReportDto {
  const cashTotal = (fields.cashTaxable.value ?? 0) + (fields.cashExempt.value ?? 0);
  const creditTotal = (fields.creditTaxable.value ?? 0) + (fields.creditExempt.value ?? 0);
  const partsTotal = sumParts(fields);
  const grandTotal = fields.grandTotal.value ?? partsTotal;

  return {
    zNumber: fields.zNumber.value ?? "",
    date: fields.date.value ?? "",
    cashTaxable: fields.cashTaxable.value ?? 0,
    cashExempt: fields.cashExempt.value ?? 0,
    creditTaxable: fields.creditTaxable.value ?? 0,
    creditExempt: fields.creditExempt.value ?? 0,
    transfers: fields.transfers.value ?? 0,
    grandTotal,
    cashTotal,
    creditTotal,
    receiptFileUrl: meta.receiptFileUrl ?? null,
    receiptFileName: meta.receiptFileName ?? null,
    receiptStoragePath: meta.receiptStoragePath ?? null,
    receiptStorageBucket: meta.receiptStorageBucket ?? null,
    receiptMimeType: meta.receiptMimeType ?? null,
    engine: "gemini_vision",
    confidence: meta.confidence,
    scanFields: fields,
    readyForConfirm: zReportReadyForConfirm(fields),
  };
}

export async function runZReportScan(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileHash?: string;
  onProgress?: ScanProgressCallback;
}): Promise<ScannedZReportDto & { error?: string; partial?: boolean; fromAiCache?: boolean }> {
  const fileHash = input.fileHash ?? hashFileBuffer(input.buffer);
  const cacheKey = scanCacheKey(fileHash, "zreport");
  const onProgress = input.onProgress;

  if (!isGeminiVisionConfigured()) {
    throw new ScanServiceError("SCAN_NOT_CONFIGURED", "Gemini AI is not configured");
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
  const [uploadResult, prepared] = await Promise.all([
    uploadScanSourceFile(input.buffer, input.fileName, input.mimeType, "zreport"),
    prepareScanInput(input.buffer, input.mimeType, input.fileName),
  ]);
  onProgress?.("preprocess");
  console.log("UPLOAD_DONE");

  type CachedZ = {
    zReport: GeminiZReportJson;
    rawResponse: string;
    confidence: number;
    model: string;
  };

  onProgress?.("ai");
  let geminiResult: CachedZ;
  let fromAiCache = false;

  const cached = await getScanCache<CachedZ>(cacheKey);
  if (cached?.zReport) {
    geminiResult = cached;
    fromAiCache = true;
  } else {
    const fresh = await scanZReportWithGemini(prepared);
    geminiResult = {
      zReport: fresh.zReport,
      rawResponse: fresh.rawResponse,
      confidence: fresh.confidence,
      model: fresh.model,
    };
    await saveScanCache({
      cacheKey,
      kind: "zreport",
      fileName: input.fileName,
      mimeType: input.mimeType,
      payload: geminiResult,
      confidence: fresh.confidence,
      rawResponse: fresh.rawResponse,
    });
  }

  onProgress?.("parse");
  console.log("[Z_REPORT_SCAN_EXTRACTED]", {
    fileHash,
    fromAiCache,
    structuredJson: geminiResult.zReport,
  });

  const fields = fieldsFromGeminiZReport(geminiResult.zReport);
  const validation = validateZReportFields(fields);
  console.log("[Z_REPORT_SCAN_VALIDATION]", validation);

  const dto = toDto(fields, {
    receiptFileUrl: uploadResult?.viewUrl ?? null,
    receiptFileName: uploadResult?.fileName ?? input.fileName,
    receiptStoragePath: uploadResult?.storagePath ?? null,
    receiptStorageBucket: uploadResult?.bucket ?? null,
    receiptMimeType: uploadResult?.fileType ?? input.mimeType,
    confidence: geminiResult.confidence,
  });

  if (!validation.ok) {
    return { ...dto, error: "SCAN_READ_FAILED", fromAiCache };
  }

  return { ...dto, fromAiCache };
}
