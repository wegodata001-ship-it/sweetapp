/**
 * Customer "כרטסת מעודכנת" presentation layer.
 * All balances come from computeLedgerStatement via ledger-route-map.
 * No orders−payments math. No clamp that hides credit.
 */
import { normalizeSupplierName } from "@/lib/document-scan/supplier-aliases";
import {
  computeLedgerStatement,
  finiteAmount,
  type LedgerComputedMovement,
  type LedgerStatement,
  type MovementType,
} from "@/lib/finance/ledger-engine";
import { statementForCustomer, type CustomerSourceDoc, type CustomerSourcePayment } from "@/lib/finance/ledger-route-map";

export const LEDGER_V2_PAGE_SIZE_DEFAULT = 25;
export const LEDGER_V2_SAFETY_CAP = 10_000;

/** FutureOrder has no customerId. OrderPayment is CASHFLOW_ONLY. Do not invent charges. */
export const FUTURE_ORDER_LEDGER_V2_POLICY = {
  included: false,
  status: "EXCLUDED" as const,
  reason:
    "FutureOrder is name-only (no customerId). OrderPayment writes CashFlow only. Adding either would risk name-merge and duplicate charges vs FinancialDocument.",
} as const;

export type LedgerV2SideFilter = "all" | "DEBT" | "CREDIT" | "ZERO";

export type LedgerV2CustomerInput = {
  id: string;
  name: string;
  phone?: string | null;
  openingBalance: number;
};

export type LedgerV2CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  openingBalance: number;
  charges: number;
  payments: number;
  creditNotes: number;
  fees: number;
  adjustments: number;
  debt: number;
  credit: number;
  signedBalance: number;
  side: LedgerStatement["side"];
  lastMovementDate: string | null;
  movementCount: number;
};

export type LedgerV2Totals = {
  totalDebt: number;
  totalCredit: number;
  totalPayments: number;
  totalCharges: number;
  customersWithDebt: number;
  customersWithCredit: number;
  customersBalanced: number;
  customerCount: number;
};

export type LedgerV2MovementView = {
  id: string;
  date: string;
  type: MovementType;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  documentId: string | null;
  documentHref: string | null;
  paymentMethod: string | null;
  notes: string | null;
  paymentStatus: string | null;
  source: "engine";
};

export type LedgerV2DocumentKpi = {
  openInvoices: number;
  paidInvoices: number;
  note: "document remaining / paymentStatus — not ledger SSOT";
};

export type LedgerV2Detail = {
  customer: LedgerV2CustomerRow;
  phone: string | null;
  periodOpening: number;
  signedBalance: number;
  debt: number;
  credit: number;
  side: LedgerStatement["side"];
  charges: number;
  payments: number;
  creditNotes: number;
  fees: number;
  adjustments: number;
  movementCount: number;
  lastMovementDate: string | null;
  documentKpi: LedgerV2DocumentKpi;
  movements: LedgerV2MovementView[];
};

export type LedgerV2MovementExtra = {
  paymentMethod?: string | null;
  notes?: string | null;
  paymentStatus?: string | null;
  documentType?: string | null;
};

export function customerMatchesSearch(
  customer: LedgerV2CustomerInput,
  query: string,
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (customer.id === q || customer.id.includes(q)) return true;
  const name = customer.name ?? "";
  if (name.includes(q)) return true;
  const nn = normalizeSupplierName(name);
  const nq = normalizeSupplierName(q);
  if (nq && nn && (nn.includes(nq) || nq.includes(nn))) return true;
  const phone = (customer.phone ?? "").trim();
  if (phone && phone.includes(q)) return true;
  const phoneDigits = phone.replace(/\D/g, "");
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
  return false;
}

export function lastMovementDate(statement: LedgerStatement): string | null {
  for (let i = statement.movements.length - 1; i >= 0; i -= 1) {
    const date = statement.movements[i]?.entry_date?.trim();
    if (date) return date;
  }
  return null;
}

export function rowFromCustomerStatement(
  customer: LedgerV2CustomerInput,
  statement: LedgerStatement,
): LedgerV2CustomerRow {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone?.trim() || null,
    openingBalance: finiteAmount(customer.openingBalance),
    charges: statement.explain.invoices,
    payments: statement.explain.payments,
    creditNotes: statement.explain.creditNotes,
    fees: statement.explain.fees,
    adjustments: statement.explain.adjustments,
    debt: statement.debt,
    credit: statement.credit,
    signedBalance: statement.signedBalance,
    side: statement.side,
    lastMovementDate: lastMovementDate(statement),
    movementCount: statement.movementCount,
  };
}

export function aggregateLedgerV2Totals(rows: LedgerV2CustomerRow[]): LedgerV2Totals {
  let totalDebt = 0;
  let totalCredit = 0;
  let totalPayments = 0;
  let totalCharges = 0;
  let customersWithDebt = 0;
  let customersWithCredit = 0;
  let customersBalanced = 0;
  for (const row of rows) {
    totalDebt += row.debt;
    totalCredit += row.credit;
    totalPayments += row.payments;
    totalCharges += row.charges;
    if (row.side === "DEBT") customersWithDebt += 1;
    else if (row.side === "CREDIT") customersWithCredit += 1;
    else customersBalanced += 1;
  }
  return {
    totalDebt,
    totalCredit,
    totalPayments,
    totalCharges,
    customersWithDebt,
    customersWithCredit,
    customersBalanced,
    customerCount: rows.length,
  };
}

export function filterLedgerV2Rows(
  rows: LedgerV2CustomerRow[],
  side: LedgerV2SideFilter,
): LedgerV2CustomerRow[] {
  if (side === "all") return rows;
  return rows.filter((row) => row.side === side);
}

export function paginateLedgerV2<T>(rows: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(5, pageSize));
  const start = (safePage - 1) * safeSize;
  return rows.slice(start, start + safeSize);
}

export function displaySide(signedBalance: number): {
  side: "DEBT" | "CREDIT" | "ZERO";
  amount: number;
} {
  const signed = finiteAmount(signedBalance);
  if (signed > 0) return { side: "DEBT", amount: signed };
  if (signed < 0) return { side: "CREDIT", amount: Math.abs(signed) };
  return { side: "ZERO", amount: 0 };
}

function paymentIdFromMovement(row: LedgerComputedMovement): string | null {
  if (row.type !== "PAYMENT") return null;
  if (row.id.startsWith("pay-")) return row.id.slice(4);
  return null;
}

export function movementsFromV2Statement(
  statement: LedgerStatement,
  extras: Record<string, LedgerV2MovementExtra> = {},
): LedgerV2MovementView[] {
  return statement.movements.map((row) => {
    const payId = paymentIdFromMovement(row);
    const extra = extras[row.id] ?? (payId ? extras[`pay-${payId}`] : undefined) ?? {};
    const documentId = row.document_id;
    return {
      id: row.id,
      date: row.entry_date,
      type: row.type,
      reference: documentId,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      balanceAfter: row.balance_after,
      documentId,
      documentHref: documentId ? `/finance/archive?doc=${encodeURIComponent(documentId)}` : null,
      paymentMethod: extra.paymentMethod ?? null,
      notes: extra.notes ?? null,
      paymentStatus: extra.paymentStatus ?? null,
      source: "engine",
    };
  });
}

export function documentKpiFromSources(documents: CustomerSourceDoc[]): LedgerV2DocumentKpi {
  let openInvoices = 0;
  let paidInvoices = 0;
  for (const doc of documents) {
    const extra = doc as CustomerSourceDoc & {
      remainingAmount?: number;
      paymentStatus?: string;
    };
    const isIncome = (doc.category ?? "").trim() === "הכנסה";
    const creditNote = /זיכוי|credit/i.test(doc.documentType);
    if (!isIncome || creditNote) continue;
    if ((extra.paymentStatus ?? "") === "paid") paidInvoices += 1;
    else if (finiteAmount(extra.remainingAmount) > 0.005) openInvoices += 1;
  }
  return {
    openInvoices,
    paidInvoices,
    note: "document remaining / paymentStatus — not ledger SSOT",
  };
}

export function detailFromCustomerStatement(params: {
  customer: LedgerV2CustomerInput;
  statement: LedgerStatement;
  extras?: Record<string, LedgerV2MovementExtra>;
  documents?: CustomerSourceDoc[];
}): LedgerV2Detail {
  const row = rowFromCustomerStatement(params.customer, params.statement);
  return {
    customer: row,
    phone: row.phone,
    periodOpening: params.statement.periodOpening,
    signedBalance: params.statement.signedBalance,
    debt: params.statement.debt,
    credit: params.statement.credit,
    side: params.statement.side,
    charges: params.statement.explain.invoices,
    payments: params.statement.explain.payments,
    creditNotes: params.statement.explain.creditNotes,
    fees: params.statement.explain.fees,
    adjustments: params.statement.explain.adjustments,
    movementCount: params.statement.movementCount,
    lastMovementDate: row.lastMovementDate,
    documentKpi: documentKpiFromSources(params.documents ?? []),
    movements: movementsFromV2Statement(params.statement, params.extras ?? {}),
  };
}

export function buildCustomerStatements(params: {
  customers: LedgerV2CustomerInput[];
  documents: CustomerSourceDoc[];
  payments: CustomerSourcePayment[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): { rows: LedgerV2CustomerRow[]; statements: LedgerStatement[] } {
  const docsByCustomer = new Map<string, CustomerSourceDoc[]>();
  for (const doc of params.documents) {
    const id = doc.customerId;
    if (!id) continue;
    const list = docsByCustomer.get(id) ?? [];
    list.push(doc);
    docsByCustomer.set(id, list);
  }
  const paysByCustomer = new Map<string, CustomerSourcePayment[]>();
  for (const pay of params.payments) {
    const id = pay.customerId;
    if (!id) continue;
    const list = paysByCustomer.get(id) ?? [];
    list.push(pay);
    paysByCustomer.set(id, list);
  }

  const statements: LedgerStatement[] = [];
  const rows: LedgerV2CustomerRow[] = [];
  for (const customer of params.customers) {
    const statement = statementForCustomer({
      id: customer.id,
      name: customer.name,
      openingBalance: customer.openingBalance,
      documents: docsByCustomer.get(customer.id) ?? [],
      payments: paysByCustomer.get(customer.id) ?? [],
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });
    statements.push(statement);
    rows.push(rowFromCustomerStatement(customer, statement));
  }
  return { rows, statements };
}

/** Test helper: statement with explicit engine movements (fees / adjustments). */
export function statementFromExplicitMovements(
  params: Parameters<typeof computeLedgerStatement>[0],
): LedgerStatement {
  return computeLedgerStatement(params);
}
