import { parsePayload, type FinanceDocumentPayload } from "@/lib/finance/document-payload";
import type { FinanceDocumentRow } from "@/lib/finance/types";
import type { FinancialDocument as PrismaFinancialDocument } from "@prisma/client";

type PrismaFinancialDocumentWithCustomer = PrismaFinancialDocument & {
  customer?: { name: string } | null;
};

export function prismaDocToFinanceRow(row: PrismaFinancialDocumentWithCustomer): FinanceDocumentRow {
  const rawMeta = row.metadata;
  const payload: FinanceDocumentPayload | null =
    rawMeta == null ? null : parsePayload(rawMeta as unknown);

  const docDateStr = row.docDate
    ? row.docDate.toISOString().slice(0, 10)
    : null;

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    document_type: row.documentType,
    customer_id: row.customerId,
    customer_name: row.customer?.name ?? null,
    total_amount: row.totalAmount,
    paid_amount: row.paidAmount,
    remaining_amount: row.remainingAmount,
    payment_status: row.paymentStatus,
    doc_date: docDateStr,
    pdf_storage_path: row.pdfStoragePath,
    sent_to_cpa: row.sentToCpa,
    created_at: row.createdAt.toISOString(),
    payload,
  };
}
