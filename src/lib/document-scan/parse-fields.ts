import type { DocumentScanFields } from "./types";

export function scanReadyForConfirm(fields: DocumentScanFields): boolean {
  return (
    fields.supplier.detected ||
    fields.date.detected ||
    fields.invoiceNumber.detected ||
    fields.total.detected
  );
}

/** @deprecated Gemini-only pipeline — kept for compatibility */
export function parseDocumentFields(): DocumentScanFields {
  throw new Error("parseDocumentFields is not available — use Gemini AI scan");
}
