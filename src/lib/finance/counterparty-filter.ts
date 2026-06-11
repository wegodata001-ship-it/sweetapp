import type { CashFlowRow, FinanceDocumentRow } from "@/lib/finance/types";

export type ExpenseCounterpartyKind = "" | "supplier" | "employee";

function rowIsExpense(entryType: string | null | undefined): boolean {
  return (entryType ?? "").trim().toLowerCase() === "expense";
}

export function isExpenseDocument(row: FinanceDocumentRow): boolean {
  return row.category === "הוצאה" || row.payload?.kind === "expense";
}

export function documentSupplierId(row: FinanceDocumentRow): string | null {
  if (row.supplier_id?.trim()) return row.supplier_id.trim();
  const p = row.payload;
  if (p?.kind === "expense" && p.supplierId?.trim()) return p.supplierId.trim();
  return null;
}

export function documentEmployeeId(row: FinanceDocumentRow): string | null {
  if (row.employee_id?.trim()) return row.employee_id.trim();
  const p = row.payload;
  if (p?.kind === "expense" && p.employeeId?.trim()) return p.employeeId.trim();
  return null;
}

export function documentMatchesExpenseCounterparty(
  row: FinanceDocumentRow,
  kind: "supplier" | "employee",
  id: string,
): boolean {
  if (!isExpenseDocument(row)) return false;
  if (kind === "supplier") return documentSupplierId(row) === id;
  return documentEmployeeId(row) === id;
}

export function cashflowRowMatchesExpenseCounterparty(
  row: CashFlowRow,
  kind: "supplier" | "employee",
  id: string,
): boolean {
  if (!rowIsExpense(row.entry_type)) return true;
  if (kind === "supplier") return (row.supplier_id ?? null) === id;
  return (row.employee_id ?? null) === id;
}
