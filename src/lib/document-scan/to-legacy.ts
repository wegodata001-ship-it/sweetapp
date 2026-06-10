import type { ScannedDocument } from "./api-response";
import type { DocumentScanFields, DocumentScanResult, IntakeMode } from "./types";
import { scanReadyForConfirm } from "./parse-fields";

export function documentScanToLegacy(
  fields: DocumentScanFields,
  meta: {
    rawText: string;
    fileName: string;
    engine: string;
    aiConfidence: number;
    intakeMode: IntakeMode;
    receiptFileUrl?: string | null;
    receiptStoragePath?: string | null;
    receiptStorageBucket?: string | null;
    receiptMimeType?: string | null;
    items?: ScannedDocument["items"];
    fromAiCache?: boolean;
  },
): ScannedDocument & { scanFields: DocumentScanFields; readyForConfirm: boolean } {
  const fieldConfidence = {
    supplier: fields.supplier.confidencePercent != null ? fields.supplier.confidencePercent / 100 : undefined,
    invoiceNumber:
      fields.invoiceNumber.confidencePercent != null
        ? fields.invoiceNumber.confidencePercent / 100
        : undefined,
    date: fields.date.confidencePercent != null ? fields.date.confidencePercent / 100 : undefined,
    total: fields.total.confidencePercent != null ? fields.total.confidencePercent / 100 : undefined,
  };

  const needsReviewFields: string[] = [];
  if (!fields.supplier.detected) needsReviewFields.push("supplier");
  if (!fields.date.detected) needsReviewFields.push("date");
  if (!fields.invoiceNumber.detected) needsReviewFields.push("invoiceNumber");
  if (!fields.total.detected) needsReviewFields.push("total");

  const invoiceKind =
    fields.documentType.value?.includes("זיכוי") ? ("credit" as const) : ("expense" as const);

  return {
    supplierRawName: fields.supplier.value ?? "",
    supplierName: fields.supplier.value ?? "",
    supplierId: null,
    suggestNewSupplier: false,
    invoiceNumber: fields.invoiceNumber.value ?? "",
    date: fields.date.value ?? "",
    documentType: fields.documentType.value ?? undefined,
    invoiceKind,
    fieldConfidence,
    needsReviewFields,
    vatAmount: fields.vat.value,
    total: fields.total.value,
    items: meta.items ?? [],
    rawText: meta.rawText,
    receiptFileUrl: meta.receiptFileUrl ?? null,
    receiptFileName: meta.fileName,
    receiptStoragePath: meta.receiptStoragePath ?? null,
    receiptStorageBucket: meta.receiptStorageBucket ?? null,
    receiptMimeType: meta.receiptMimeType ?? null,
    engine: meta.engine,
    confidence: meta.aiConfidence,
    fromAiCache: meta.fromAiCache === true,
    parseQualityOk: scanReadyForConfirm(fields),
    parseQualityIssues: needsReviewFields as ("supplier" | "invoiceNumber" | "date" | "total" | "parse")[],
    scanFields: fields,
    readyForConfirm: scanReadyForConfirm(fields),
  };
}

export function toDocumentScanResult(
  fields: DocumentScanFields,
  rawText: string,
  intakeMode: IntakeMode,
): DocumentScanResult {
  return {
    ...fields,
    rawText,
    intakeMode,
    readyForConfirm: scanReadyForConfirm(fields),
  };
}
