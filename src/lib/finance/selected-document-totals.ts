import { REPORT_TYPES } from "@/lib/pdf/constants";
import type { FinanceDocumentRow } from "@/lib/finance/types";

export type SelectedDocumentTotals = {
  count: number;
  total: number;
  income: number;
  expense: number;
  net: number;
  showSplit: boolean;
};

function isIncomeType(documentType: string): boolean {
  return documentType.toUpperCase() === REPORT_TYPES.INCOME;
}

function isExpenseType(documentType: string): boolean {
  const dt = documentType.toUpperCase();
  return dt === REPORT_TYPES.EXPENSE || dt === REPORT_TYPES.PAYMENT;
}

/** חישוב client-side מנתוני הטבלה שכבר נטענו — ללא query */
export function computeSelectedDocumentTotals(
  rows: FinanceDocumentRow[],
  selectedIds: ReadonlySet<string> | readonly string[],
): SelectedDocumentTotals {
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const selected = rows.filter((row) => idSet.has(row.id));

  let total = 0;
  let income = 0;
  let expense = 0;
  let hasIncome = false;
  let hasExpense = false;

  for (const row of selected) {
    const amt = Number(row.total_amount) || 0;
    total += amt;
    const dt = row.document_type ?? "";
    if (isIncomeType(dt)) {
      income += amt;
      hasIncome = true;
    } else if (isExpenseType(dt)) {
      expense += amt;
      hasExpense = true;
    }
  }

  return {
    count: selected.length,
    total,
    income,
    expense,
    net: income - expense,
    showSplit: hasIncome && hasExpense,
  };
}
