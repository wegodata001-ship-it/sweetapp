import { parsePayload, type FinanceDocumentPayload } from "@/lib/finance/document-payload";
import type { FinanceDocumentRow } from "@/lib/finance/types";
import type { FinancialDocument as PrismaFinancialDocument } from "@prisma/client";

type PrismaFinancialDocumentWithCustomer = PrismaFinancialDocument & {
  customer?: { name: string } | null;
  payments?: { amount: number }[];
  sentToCpaBy?: { id: string; fullName: string } | null;
  sentToCpaAt?: Date | null;
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
  const paidAmount =
    row.documentType === "דוח Z"
      ? row.totalAmount
      : row.category === "הכנסה" && row.payments
        ? row.payments.reduce((sum, payment) => sum + Math.max(0, payment.amount), 0)
        : row.paidAmount;
  const remainingAmount = Math.max(0, row.totalAmount - paidAmount);
  const paymentStatus =
    row.totalAmount <= 0 ? "unpaid" : remainingAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    document_type: row.documentType,
    customer_id: row.customerId,
    customer_name: row.customer?.name ?? null,
    total_amount: row.totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    payment_status: paymentStatus,
    deposit_amount:
      depositSource.depositAmount ?? (payload && payload.kind !== "zreport" ? Number(payload.depositAmount) || 0 : 0),
    deposit_type: depositSource.depositType ?? (payload && payload.kind !== "zreport" ? payload.depositType : null),
    deposit_note: depositSource.depositNote ?? (payload && payload.kind !== "zreport" ? payload.depositNote : null),
    deposit_status: depositSource.depositStatus ?? (payload && payload.kind !== "zreport" ? payload.depositStatus : null),
    doc_date: docDateStr,
    pdf_storage_path: row.pdfStoragePath,
    sent_to_cpa: row.sentToCpa,
    sent_to_cpa_at: row.sentToCpaAt ? row.sentToCpaAt.toISOString() : null,
    sent_to_cpa_by: row.sentToCpaBy
      ? { id: row.sentToCpaBy.id, full_name: row.sentToCpaBy.fullName }
      : null,
    created_at: row.createdAt.toISOString(),
    payload,
  };
}
