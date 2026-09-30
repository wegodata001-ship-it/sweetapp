/** Invoice document types already stored on FinancialDocument.documentType. */
export function isInvoiceDocumentType(documentType: string | null | undefined): boolean {
  const raw = (documentType ?? "").trim();
  if (!raw) return false;
  return raw === "חשבונית" || raw.startsWith("חשבונית ") || raw.startsWith("חשבונית/");
}
