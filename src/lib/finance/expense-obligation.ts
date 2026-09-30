/**
 * Remaining supplier obligation for an expense document.
 * The ledger engine formula is unchanged (opening + debit − credit).
 * This only decides how much of an expense is still payable.
 *
 * Expense ≠ automatic debt:
 * - typed payment 7,000 of 10,000 → remaining 3,000
 * - typed payment 10,000 → remaining 0
 * - typed payment 0 → remaining = total (unpaid credit)
 * - default blank payment line → not an open bill
 */
import {
  parsePayload,
  paymentLinesHaveTypedAmount,
  paymentLinesTotal,
  type IncomeExpensePayload,
} from "@/lib/finance/document-payload";

export const EXPENSE_OBLIGATION_DOC_SELECT = {
  id: true,
  category: true,
  totalAmount: true,
  paidAmount: true,
  metadata: true,
} as const;

export type ExpenseObligationDoc = {
  id: string;
  category: string;
  totalAmount: number;
  paidAmount: number;
  metadata: unknown;
};

export function appliedExpensePaid(params: {
  total: number;
  storedPaid: number;
  payload: IncomeExpensePayload | null;
}): number {
  const total = Math.max(0, Number(params.total) || 0);
  const storedPaid = Math.min(total, Math.max(0, Number(params.storedPaid) || 0));
  const payload = params.payload;
  if (!payload || payload.kind !== "expense") {
    return storedPaid;
  }

  const linePaid = paymentLinesTotal(payload);
  if (linePaid > 1e-9) return Math.min(total, linePaid);
  if (storedPaid > 1e-9) return storedPaid;
  if (paymentLinesHaveTypedAmount(payload)) return storedPaid;
  return total;
}

export function expenseOpenRemaining(params: {
  total: number;
  storedPaid: number;
  payload: IncomeExpensePayload | null;
}): number {
  const total = Math.max(0, Number(params.total) || 0);
  return Math.max(0, total - appliedExpensePaid(params));
}

export function applyExpenseObligationToEntries<
  T extends {
    financialDocumentId?: string | null;
    supplierId?: string | null;
    debit: number;
    credit: number;
  },
>(entries: T[], docs: Iterable<ExpenseObligationDoc>): T[] {
  const byId = new Map<string, ExpenseObligationDoc>();
  for (const doc of docs) byId.set(doc.id, doc);

  return entries.flatMap((entry) => {
    if (!entry.supplierId || !entry.financialDocumentId) return [entry];
    const doc = byId.get(entry.financialDocumentId);
    if (!doc || doc.category.trim() !== "הוצאה") return [entry];
    const payload = parsePayload(doc.metadata);
    if (!payload || payload.kind !== "expense") return [entry];
    const paid = appliedExpensePaid({
      total: doc.totalAmount,
      storedPaid: doc.paidAmount,
      payload,
    });
    const typed = paymentLinesHaveTypedAmount(payload);
    if (!typed && paid >= Math.max(0, Number(doc.totalAmount) || 0) - 1e-9) {
      return [];
    }
    const debit = Math.max(0, Number(doc.totalAmount) || 0);
    const credit = Math.min(debit, paid);
    return [{ ...entry, debit, credit }];
  });
}
