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
  const depositSource = row as PrismaFinancialDocumentWithCustomer & {
    depositAmount?: number | null;
    depositType?: string | null;
    depositNote?: string | null;
    depositStatus?: string | null;
  };

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
    deposit_amount:
      depositSource.depositAmount ?? (payload && payload.kind !== "zreport" ? Number(payload.depositAmount) || 0 : 0),
    deposit_type: depositSource.depositType ?? (payload && payload.kind !== "zreport" ? payload.depositType : null),
    deposit_note: depositSource.depositNote ?? (payload && payload.kind !== "zreport" ? payload.depositNote : null),
    deposit_status: depositSource.depositStatus ?? (payload && payload.kind !== "zreport" ? payload.depositStatus : null),
    doc_date: docDateStr,
    pdf_storage_path: row.pdfStoragePath,
    sent_to_cpa: row.sentToCpa,
    created_at: row.createdAt.toISOString(),
    payload,
  };
}
