/**
 * Optional computed ledgers. DERIVED DATA — never a restore source.
 */
import { amountToDecimalString } from "./serialize";

export type DerivedLedgerLine = {
  date: string | null;
  kind: string;
  sourceModel: string;
  sourceId: string;
  description: string;
  debit: string | null;
  credit: string | null;
};

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildCustomerDerivedLedger(input: {
  customerId: string;
  openingBalance: unknown;
  documents: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}): { lines: DerivedLedgerLine[]; note: string } {
  const lines: DerivedLedgerLine[] = [
    {
      date: null,
      kind: "OPENING_BALANCE",
      sourceModel: "Customer",
      sourceId: input.customerId,
      description: "Opening balance (source field)",
      debit: null,
      credit: amountToDecimalString(input.openingBalance),
    },
  ];

  for (const doc of input.documents) {
    if (String(doc.customerId ?? "") !== input.customerId) continue;
    lines.push({
      date: typeof doc.docDate === "string" ? doc.docDate : typeof doc.createdAt === "string" ? doc.createdAt : null,
      kind: String(doc.documentType ?? "DOCUMENT"),
      sourceModel: "FinancialDocument",
      sourceId: String(doc.id ?? ""),
      description: String(doc.title ?? ""),
      debit: amountToDecimalString(doc.totalAmount),
      credit: null,
    });
  }

  for (const pay of input.payments) {
    if (String(pay.customerId ?? "") !== input.customerId) continue;
    lines.push({
      date: typeof pay.createdAt === "string" ? pay.createdAt : null,
      kind: "PAYMENT",
      sourceModel: "Payment",
      sourceId: String(pay.id ?? ""),
      description: String(pay.notes ?? pay.paymentMethod ?? "Payment"),
      debit: null,
      credit: amountToDecimalString(pay.amount),
    });
  }

  const debit = lines.reduce((s, l) => s + num(l.debit), 0);
  const credit = lines.reduce((s, l) => s + num(l.credit), 0);
  lines.push({
    date: null,
    kind: "DERIVED_BALANCE",
    sourceModel: "COMPUTED",
    sourceId: "",
    description: "Arithmetic only — restore from source records",
    debit: amountToDecimalString(debit),
    credit: amountToDecimalString(credit),
  });

  return {
    lines,
    note: "DERIVED DATA. Source records (FinancialDocument, Payment, LedgerEntry, CashFlowEntry) are authoritative for restore.",
  };
}
