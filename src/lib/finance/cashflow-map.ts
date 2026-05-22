import type { CashFlowEntry as PrismaCf } from "@prisma/client";
import type { CashFlowRow } from "@/lib/finance/types";

/** מיפוי סוג תנועה לכניסה/יציאה — לפי סוג התנועה, לא Math.abs גורף על הסכום. */
export function prismaCashFlowToRow(entry: PrismaCf): CashFlowRow {
  const t = entry.entryType.toLowerCase();
  const raw = Number(entry.amount);
  let inflow = 0;
  let outflow = 0;
  if (Number.isFinite(raw)) {
    if (t === "income" || t === "deposit") {
      inflow = raw >= 0 ? raw : 0;
    } else if (["expense", "refund", "supplier_payment", "salary", "deposit_refund"].includes(t)) {
      outflow = raw >= 0 ? raw : -raw;
    }
  }

  return {
    id: entry.id,
    entry_date: entry.entryDate.toISOString().slice(0, 10),
    description: entry.description ?? "",
    entry_type: entry.entryType,
    payment_method: entry.paymentMethod,
    payment_id: entry.paymentId,
    document_id: entry.documentId ?? entry.relatedDocumentId,
    customer_id: entry.customerId,
    customer_name: entry.customerName,
    notes: entry.notes,
    source: entry.source ?? null,
    z_report_id: entry.zReportId ?? null,
    inflow,
    outflow,
    is_direct: entry.isDirect,
    expense_type: entry.expenseType ?? null,
  };
}
