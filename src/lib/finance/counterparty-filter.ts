import type { CashFlowRow, FinanceDocumentRow } from "@/lib/finance/types";
import { isZReportCashFlowRow } from "@/lib/finance/cashflow-display";

export type ExpenseCounterpartyKind = "" | "supplier" | "employee";

export type ArchiveCounterpartyKind = "customer" | "supplier" | "employee";

/** סינון סוג גורם באוטocomplete ארכיון (ריק = הכל) */
export type ArchiveCounterpartyKindFilter = "" | ArchiveCounterpartyKind;

export type ArchiveCounterpartyRef = {
  kind: ArchiveCounterpartyKind;
  id: string;
  name: string;
};

export type CashflowEntityFilterKind = "" | "customer" | "supplier" | "employee";

const EXPENSE_ENTRY_TYPES = new Set([
  "expense",
  "refund",
  "supplier_payment",
  "salary",
  "deposit_refund",
]);

function rowIsExpense(entryType: string | null | undefined): boolean {
  const et = (entryType ?? "").trim().toLowerCase();
  return EXPENSE_ENTRY_TYPES.has(et) || et === "expense";
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

export function documentCustomerId(row: FinanceDocumentRow): string | null {
  if (row.customer_id?.trim()) return row.customer_id.trim();
  return null;
}

export function encodeArchiveCounterpartyKey(kind: ArchiveCounterpartyKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseArchiveCounterpartyKey(key: string): ArchiveCounterpartyRef | null {
  const trimmed = key.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0) return null;
  const kind = trimmed.slice(0, idx) as ArchiveCounterpartyKind;
  const id = trimmed.slice(idx + 1);
  if (!id || !["customer", "supplier", "employee"].includes(kind)) return null;
  return { kind, id, name: "" };
}

export function documentMatchesArchiveCounterparty(
  row: FinanceDocumentRow,
  kind: ArchiveCounterpartyKind,
  id: string,
): boolean {
  switch (kind) {
    case "customer":
      return documentCustomerId(row) === id;
    case "supplier":
      return documentSupplierId(row) === id;
    case "employee":
      return documentEmployeeId(row) === id;
    default:
      return false;
  }
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

/** סיווג גורם לתנועת יומן */
export function cashflowRowEntityKind(row: CashFlowRow): CashflowEntityFilterKind | null {
  if (row.supplier_id) return "supplier";
  if (row.employee_id) return "employee";
  if (isZReportCashFlowRow(row)) return "customer";
  const et = (row.entry_type ?? "").trim().toLowerCase();
  if (rowIsExpense(row.entry_type)) return null;
  if (et === "income" || et === "deposit" || row.customer_id) return "customer";
  if (row.inflow > 0 && !rowIsExpense(et)) return "customer";
  return null;
}

export function cashflowRowMatchesEntityFilter(
  row: CashFlowRow,
  entityType: CashflowEntityFilterKind,
): boolean {
  if (!entityType) return true;
  return cashflowRowEntityKind(row) === entityType;
}

export function cashflowRowSearchText(
  row: CashFlowRow,
  supplierNameById: Map<string, string>,
  employeeNameById: Map<string, string>,
): string {
  const parts = [
    row.customer_name,
    row.description,
    row.supplier_id ? supplierNameById.get(row.supplier_id) : null,
    row.employee_id ? employeeNameById.get(row.employee_id) : null,
  ];
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

