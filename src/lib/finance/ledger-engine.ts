/**
 * Ledger calculation SSOT. Live /api/ledger/overview and /api/ledger/movements
 * both derive balances from computeLedgerStatement (via ledger-route-map).
 *
 * signed = opening + Σ(debit − credit)
 * debt   = max(signed, 0)
 * credit = max(−signed, 0)
 *
 * Identity is entity ID only. Same names are never merged.
 * OrderPayment is not a ledger input (UNPROVEN).
 * Currency is ILS only — no FX.
 */

export const LEDGER_CURRENCY = "ILS" as const;
export const MULTI_CURRENCY_LEDGER_SUPPORTED = false;

export const ORDER_PAYMENT_LEDGER_POLICY = {
  status: "UNPROVEN" as const,
  included: false,
  reason:
    "OrderPayment currently syncs CashFlow only. Not proven as a customer AR receipt.",
} as const;

export type LedgerEntityType = "customer" | "supplier" | "employee";

export type MovementType =
  | "OPENING_BALANCE"
  | "INVOICE"
  | "PAYMENT"
  | "CREDIT_NOTE"
  | "FEE"
  | "EXPENSE"
  | "ADJUSTMENT"
  | "BALANCE_BROUGHT_FORWARD";

export type MovementRule = {
  type: MovementType;
  direction: "debit" | "credit" | "signed" | "as_provided";
  sign: string;
  amountSource: string;
  currency: typeof LEDGER_CURRENCY;
  entityTypes: LedgerEntityType[];
  dateSource: string;
  reference: string;
  effect: string;
};

/** Central movement rules — do not copy into routes. */
export const MOVEMENT_RULES: Record<MovementType, MovementRule> = {
  OPENING_BALANCE: {
    type: "OPENING_BALANCE",
    direction: "signed",
    sign: "positive = opening debt; negative = opening credit",
    amountSource: "entity.openingBalance",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier", "employee"],
    dateSource: "before all dated movements",
    reference: "entity.id",
    effect: "First movement. Starts signed balance.",
  },
  INVOICE: {
    type: "INVOICE",
    direction: "debit",
    sign: "+amount (customer owes us / we owe supplier or employee)",
    amountSource: "FinancialDocument.totalAmount",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer"],
    dateSource: "docDate ?? createdAt",
    reference: "document.id",
    effect: "Increases signed balance.",
  },
  PAYMENT: {
    type: "PAYMENT",
    direction: "credit",
    sign: "−amount",
    amountSource: "Payment.amount or LedgerEntry.credit",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier", "employee"],
    dateSource: "createdAt / entryDate",
    reference: "payment.id / ledgerEntry.id",
    effect: "Decreases signed balance.",
  },
  CREDIT_NOTE: {
    type: "CREDIT_NOTE",
    direction: "credit",
    sign: "−amount — never treated as a charge",
    amountSource: "FinancialDocument.totalAmount when type is credit note",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier"],
    dateSource: "docDate ?? createdAt",
    reference: "document.id",
    effect: "Reduces debt / increases credit. Direction does not depend on category.",
  },
  FEE: {
    type: "FEE",
    direction: "debit",
    sign: "+amount",
    amountSource: "explicit fee movement (no proven auto-source yet)",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier", "employee"],
    dateSource: "movement date",
    reference: "movement.id",
    effect: "Increases signed balance.",
  },
  EXPENSE: {
    type: "EXPENSE",
    direction: "debit",
    sign: "+amount (we owe more)",
    amountSource: "LedgerEntry.debit / expense document",
    currency: LEDGER_CURRENCY,
    entityTypes: ["supplier", "employee"],
    dateSource: "entryDate",
    reference: "ledgerEntry.id / document.id",
    effect: "Increases signed balance.",
  },
  ADJUSTMENT: {
    type: "ADJUSTMENT",
    direction: "as_provided",
    sign: "debit − credit as stored",
    amountSource: "LedgerEntry.debit / LedgerEntry.credit",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier", "employee"],
    dateSource: "entryDate",
    reference: "ledgerEntry.id",
    effect: "Applies stored debit and credit.",
  },
  BALANCE_BROUGHT_FORWARD: {
    type: "BALANCE_BROUGHT_FORWARD",
    direction: "signed",
    sign: "signed balance before dateFrom",
    amountSource: "opening + movements before range",
    currency: LEDGER_CURRENCY,
    entityTypes: ["customer", "supplier", "employee"],
    dateSource: "dateFrom",
    reference: "entity.id",
    effect: "Period starts from prior signed balance, not 0.",
  },
};

export const LEDGER_SIGNED_SEMANTICS = {
  customer: {
    debt: "Customer owes us (AR)",
    credit: "Customer credit / overpayment",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
  },
  supplier: {
    debt: "We owe the supplier (AP)",
    credit: "Supplier credit / we overpaid",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
  },
  employee: {
    debt: "We owe the employee",
    credit: "Employee credit / advance / we overpaid",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
  },
} as const;

export type LedgerInputMovement = {
  id: string;
  date: string;
  type: Exclude<MovementType, "OPENING_BALANCE" | "BALANCE_BROUGHT_FORWARD">;
  amount?: number;
  debit?: number;
  credit?: number;
  description: string;
  documentId?: string | null;
};

export type LedgerComputedMovement = {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_type: LedgerEntityType;
  entry_date: string;
  type: MovementType;
  doc_type: string;
  description: string;
  debit: number;
  credit: number;
  document_id: string | null;
  balance_before: number;
  balance_after: number;
};

export type LedgerExplain = {
  opening: number;
  invoices: number;
  payments: number;
  creditNotes: number;
  fees: number;
  expenses: number;
  adjustments: number;
  current: number;
};

export type LedgerStatement = {
  entityType: LedgerEntityType;
  entityId: string;
  entityName: string;
  periodOpening: number;
  signedBalance: number;
  debt: number;
  credit: number;
  side: "DEBT" | "CREDIT" | "ZERO";
  periodDebit: number;
  periodCredit: number;
  movementCount: number;
  explain: LedgerExplain;
  movements: LedgerComputedMovement[];
};

export function finiteAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function splitSignedBalance(signedBalance: number): {
  signedBalance: number;
  debt: number;
  credit: number;
  side: "DEBT" | "CREDIT" | "ZERO";
} {
  const signed = finiteAmount(signedBalance);
  const debt = Math.max(signed, 0);
  const credit = Math.max(-signed, 0);
  return {
    signedBalance: signed,
    debt,
    credit,
    side: signed > 0 ? "DEBT" : signed < 0 ? "CREDIT" : "ZERO",
  };
}

export function isCreditNoteType(documentType: string | null | undefined): boolean {
  const raw = (documentType ?? "").trim();
  if (!raw) return false;
  const n = raw.toLowerCase().replace(/\s+/g, " ");
  return (
    raw === "חשבונית זיכוי" ||
    n === "credit note" ||
    n === "creditnote" ||
    n.includes("credit note") ||
    /إشعار\s*دائن/.test(raw) ||
    /اشعار\s*دائن/.test(raw)
  );
}

export function amountsFromRule(
  type: MovementType,
  amount: number,
): { debit: number; credit: number } {
  const abs = Math.abs(finiteAmount(amount));
  const rule = MOVEMENT_RULES[type];
  if (rule.direction === "debit") return { debit: abs, credit: 0 };
  if (rule.direction === "credit") return { debit: 0, credit: abs };
  if (rule.direction === "signed") {
    return {
      debit: Math.max(finiteAmount(amount), 0),
      credit: Math.max(-finiteAmount(amount), 0),
    };
  }
  return { debit: 0, credit: 0 };
}

function day(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && value.includes("T")) return d.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

function inRange(isoDay: string, from?: string | null, to?: string | null): boolean {
  if (!isoDay) return !from && !to;
  if (from && isoDay < from) return false;
  if (to && isoDay > to) return false;
  return true;
}

function beforeRange(isoDay: string, from?: string | null): boolean {
  return Boolean(from && isoDay && isoDay < from);
}

function deltaOf(debit: number, credit: number): number {
  return finiteAmount(debit) - finiteAmount(credit);
}

function normalizeMovement(row: LedgerInputMovement): {
  id: string;
  date: string;
  type: LedgerInputMovement["type"];
  debit: number;
  credit: number;
  description: string;
  documentId: string | null;
  sortKey: string;
} {
  const rule = MOVEMENT_RULES[row.type];
  let debit = Math.max(0, finiteAmount(row.debit));
  let credit = Math.max(0, finiteAmount(row.credit));
  if (rule.direction !== "as_provided") {
    const split = amountsFromRule(row.type, row.amount ?? debit - credit);
    debit = split.debit;
    credit = split.credit;
  }
  const date = day(row.date);
  return {
    id: row.id,
    date,
    type: row.type,
    debit,
    credit,
    description: row.description,
    documentId: row.documentId ?? null,
    sortKey: `${date}|${row.id}`,
  };
}

export function computeLedgerStatement(params: {
  entityType: LedgerEntityType;
  entityId: string;
  entityName: string;
  openingBalance: number;
  movements: LedgerInputMovement[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  const opening = finiteAmount(params.openingBalance);
  const dateFrom = params.dateFrom?.trim() || null;
  const dateTo = params.dateTo?.trim() || null;
  const dated = [...params.movements].map(normalizeMovement).sort((a, b) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return a.id.localeCompare(b.id);
  });

  let periodOpening = opening;
  const period: typeof dated = [];
  for (const row of dated) {
    if (beforeRange(row.date, dateFrom)) {
      periodOpening += deltaOf(row.debit, row.credit);
      continue;
    }
    if (!inRange(row.date, dateFrom, dateTo)) continue;
    period.push(row);
  }

  const movements: LedgerComputedMovement[] = [];
  let running = 0;
  let periodDebit = 0;
  let periodCredit = 0;
  const explain: LedgerExplain = {
    opening: periodOpening,
    invoices: 0,
    payments: 0,
    creditNotes: 0,
    fees: 0,
    expenses: 0,
    adjustments: 0,
    current: 0,
  };

  const push = (
    row: {
      id: string;
      date: string;
      type: MovementType;
      debit: number;
      credit: number;
      description: string;
      documentId: string | null;
    },
  ) => {
    const before = running;
    running += deltaOf(row.debit, row.credit);
    periodDebit += row.debit;
    periodCredit += row.credit;
    movements.push({
      id: row.id,
      entity_id: params.entityId,
      entity_name: params.entityName,
      entity_type: params.entityType,
      entry_date: row.date,
      type: row.type,
      doc_type: row.type,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      document_id: row.documentId,
      balance_before: before,
      balance_after: running,
    });
  };

  if (!dateFrom && opening !== 0) {
    const split = amountsFromRule("OPENING_BALANCE", opening);
    push({
      id: `opening-${params.entityId}`,
      date: "",
      type: "OPENING_BALANCE",
      debit: split.debit,
      credit: split.credit,
      description: "יתרת פתיחה",
      documentId: null,
    });
  } else if (dateFrom) {
    const split = amountsFromRule("BALANCE_BROUGHT_FORWARD", periodOpening);
    push({
      id: `bhf-${params.entityId}`,
      date: dateFrom,
      type: "BALANCE_BROUGHT_FORWARD",
      debit: split.debit,
      credit: split.credit,
      description: "יתרה לפני טווח התאריכים",
      documentId: null,
    });
  } else {
    running = opening;
  }

  for (const row of period) {
    if (row.type === "INVOICE") explain.invoices += row.debit;
    else if (row.type === "PAYMENT") explain.payments += row.credit;
    else if (row.type === "CREDIT_NOTE") explain.creditNotes += row.credit;
    else if (row.type === "FEE") explain.fees += row.debit;
    else if (row.type === "EXPENSE") explain.expenses += row.debit;
    else explain.adjustments += deltaOf(row.debit, row.credit);
    push(row);
  }

  const split = splitSignedBalance(running);
  explain.current = running;

  return {
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    periodOpening,
    signedBalance: split.signedBalance,
    debt: split.debt,
    credit: split.credit,
    side: split.side,
    periodDebit,
    periodCredit,
    movementCount: movements.length,
    explain,
    movements,
  };
}

export function customerMovementsFromSources(params: {
  documents: Array<{
    id: string;
    documentType: string;
    category: string;
    title: string;
    totalAmount: number;
    docDate?: Date | string | null;
    createdAt: Date | string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    createdAt: Date | string;
    documentId?: string | null;
    documentTitle?: string | null;
  }>;
}): LedgerInputMovement[] {
  const out: LedgerInputMovement[] = [];
  for (const doc of params.documents) {
    const creditNote = isCreditNoteType(doc.documentType);
    if ((doc.category ?? "").trim() !== "הכנסה" && !creditNote) continue;
    out.push({
      id: `doc-${doc.id}`,
      date: day(doc.docDate ?? doc.createdAt),
      type: creditNote ? "CREDIT_NOTE" : "INVOICE",
      amount: Math.abs(finiteAmount(doc.totalAmount)),
      description: doc.title,
      documentId: doc.id,
    });
  }
  for (const payment of params.payments) {
    const note = payment.documentTitle?.trim() ? ` — ${payment.documentTitle.trim()}` : "";
    out.push({
      id: `pay-${payment.id}`,
      date: day(payment.createdAt),
      type: "PAYMENT",
      amount: Math.abs(finiteAmount(payment.amount)),
      description: `תשלום${note}`,
      documentId: payment.documentId ?? null,
    });
  }
  return out;
}

export function entryMovementsFromSources(
  entries: Array<{
    id: string;
    debit: number;
    credit: number;
    entryDate: Date | string;
    docType: string;
    description: string;
    financialDocumentId?: string | null;
  }>,
): LedgerInputMovement[] {
  return entries.map((row) => {
    const debit = Math.max(0, finiteAmount(row.debit));
    const credit = Math.max(0, finiteAmount(row.credit));
    const type: LedgerInputMovement["type"] =
      credit > 0 && debit === 0 ? "PAYMENT" : debit > 0 && credit === 0 ? "EXPENSE" : "ADJUSTMENT";
    return {
      id: row.id,
      date: day(row.entryDate),
      type,
      debit,
      credit,
      description: row.description || row.docType,
      documentId: row.financialDocumentId ?? null,
    };
  });
}

export function computeCustomerLedger(params: {
  entityId: string;
  entityName: string;
  openingBalance: number;
  documents: Parameters<typeof customerMovementsFromSources>[0]["documents"];
  payments: Parameters<typeof customerMovementsFromSources>[0]["payments"];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  return computeLedgerStatement({
    entityType: "customer",
    entityId: params.entityId,
    entityName: params.entityName,
    openingBalance: params.openingBalance,
    movements: customerMovementsFromSources(params),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}

export function overviewRowFromStatement(
  entity: {
    entity_type: LedgerEntityType;
    id: string;
    name: string;
    opening_balance: number;
  },
  statement: LedgerStatement,
): {
  entity_type: LedgerEntityType;
  id: string;
  name: string;
  opening_balance: number;
  open_balance: number;
  signed_balance: number;
  debt: number;
  credit: number;
  side: LedgerStatement["side"];
  total_debit: number;
  total_credit: number;
  movement_count: number;
} {
  return {
    entity_type: entity.entity_type,
    id: entity.id,
    name: entity.name,
    opening_balance: finiteAmount(entity.opening_balance),
    open_balance: statement.signedBalance,
    signed_balance: statement.signedBalance,
    debt: statement.debt,
    credit: statement.credit,
    side: statement.side,
    total_debit: statement.periodDebit,
    total_credit: statement.periodCredit,
    movement_count: statement.movementCount,
  };
}

export function movementsFromStatement(statement: LedgerStatement) {
  return statement.movements.map((row) => ({
    id: row.id,
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    entity_type: row.entity_type,
    entry_date: row.entry_date,
    doc_type: row.doc_type,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    document_id: row.document_id,
    open_balance: row.balance_after,
  }));
}

export function computeEntryLedger(params: {
  entityType: "supplier" | "employee";
  entityId: string;
  entityName: string;
  openingBalance: number;
  entries: Parameters<typeof entryMovementsFromSources>[0];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  return computeLedgerStatement({
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    openingBalance: params.openingBalance,
    movements: entryMovementsFromSources(params.entries),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}
