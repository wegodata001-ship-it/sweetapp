/**
 * כרטסת — מנוע חישוב יחיד (SSOT).
 * GET/read-only: לא כותב FinancialDocument / Payment / LedgerEntry / OrderPayment.
 *
 * signedBalance = opening + Σ(debit − credit)
 * debt   = max(signedBalance, 0)
 * credit = max(−signedBalance, 0)
 *
 * אסור clamp לפני הפיצול (אין Math.max(0, charges − payments) כיתרה).
 */

import type { EntityType, LedgerMovementView } from "@/lib/finance/types";

/** אין מודל מטבע מלא — כל סכומי הכרטסת מטופלים כ־ILS ללא שער המרה. */
export const MULTI_CURRENCY_LEDGER_SUPPORTED = false;
export const LEDGER_CURRENCY = "ILS" as const;

/**
 * OrderPayment לא נכנס לכרטסת.
 * CURRENT: רק CashFlowEntry דרך order-cashflow-sync.
 * EVIDENCE: movements/overview קוראים FinancialDocument+Payment / LedgerEntry בלבד.
 * RECOMMENDED: לא לשנות עד שיוכח כלל עסקי שתשלום הזמנה = קבלה בכרטסת לקוח.
 */
export const ORDER_PAYMENT_LEDGER_POLICY = {
  status: "UNPROVEN" as const,
  current:
    "OrderPayment → CashFlowEntry only (order-cashflow-sync). Not joined into customer/supplier/employee ledger.",
  recommended:
    "Keep OrderPayment out of the ledger until a proven rule says an order payment is also a customer AR receipt.",
  evidence: [
    "src/lib/finance/order-cashflow-sync.ts createCashFlowForOrderPayment",
    "src/app/api/ledger/movements/route.ts — FinancialDocument + Payment / LedgerEntry only",
    "src/app/api/ledger/overview/route.ts — same sources",
  ],
} as const;

/**
 * סמנטיקת סימן — מנוסחת ממקורות קיימים, לא מהעתקה עיוורת בין סוגי ישות.
 *
 * לקוח: מסמכי הכנסה = חיוב (debit), תשלום/זיכוי = זכות (credit).
 *   חיובי = הלקוח חייב לנו (AR).
 *
 * ספק: LedgerEntry קיים, תשלום ספק מסונכרן כ־credit (expense-ledger-sync).
 *   signed = opening + debit − credit. חיובי = אנחנו חייבים לספק (AP).
 *
 * עובד: אותו מנוע LedgerEntry; תשלום עובד מסונכרן כ־credit.
 *   חיובי = אנחנו חייבים לעובד.
 *
 * openingBalance: Float חופשי. הנוסחה הקיימת לספק/עובד היא opening + debit − credit
 * ומטריצת הלקוח «Opening debt 500 → Debt 1100» מוכיחה: חיובי = חוב התחלתי, שלילי = זכות התחלתית.
 */
export const LEDGER_SIGNED_SEMANTICS = {
  customer: {
    debt: "Customer owes us (AR)",
    credit: "Customer credit / overpayment",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
    formula: "opening + charges − payments − creditNotes",
  },
  supplier: {
    debt: "We owe the supplier (AP)",
    credit: "Supplier credit / we overpaid",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
    formula: "opening + ledgerDebit − ledgerCredit",
  },
  employee: {
    debt: "We owe the employee",
    credit: "Employee credit / advance / we overpaid",
    openingPositive: "DEBT",
    openingNegative: "CREDIT",
    formula: "opening + ledgerDebit − ledgerCredit",
  },
} as const;

export const CUSTOMER_CREDIT_NOTE_TYPE = "חשבונית זיכוי";

export type LedgerEventKind = "charge" | "payment" | "credit_note" | "adjustment";

export type LedgerCalcEvent = {
  id: string;
  date: string;
  sortKey: string;
  debit: number;
  credit: number;
  kind: LedgerEventKind;
  docType: string;
  description: string;
  documentId?: string | null;
};

export type LedgerExplain = {
  opening: number;
  charges: number;
  payments: number;
  creditNotes: number;
  adjustments: number;
  current: number;
};

export type LedgerComputedMovement = LedgerMovementView & {
  balance_before: number;
  balance_after: number;
};

export type LedgerStatement = {
  entityType: EntityType;
  periodOpening: number;
  signedBalance: number;
  debt: number;
  credit: number;
  periodDebit: number;
  periodCredit: number;
  movementCount: number;
  explain: LedgerExplain;
  movements: LedgerComputedMovement[];
};

export type CustomerDocSource = {
  id: string;
  customerId?: string | null;
  documentType: string;
  category: string;
  title: string;
  totalAmount: number;
  docDate: Date | string | null;
  createdAt: Date | string;
};

export type CustomerPaymentSource = {
  id: string;
  customerId?: string | null;
  amount: number;
  createdAt: Date | string;
  documentId?: string | null;
  documentTitle?: string | null;
};

export type EntrySource = {
  id: string;
  debit: number;
  credit: number;
  entryDate: Date | string;
  createdAt?: Date | string | null;
  docType: string;
  description: string;
  financialDocumentId?: string | null;
};

export function finiteAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function splitSignedBalance(signedBalance: number): {
  signedBalance: number;
  debt: number;
  credit: number;
} {
  const signed = finiteAmount(signedBalance);
  return {
    signedBalance: signed,
    debt: Math.max(signed, 0),
    credit: Math.max(-signed, 0),
  };
}

export function ledgerDayFromDate(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function customerDocDay(doc: Pick<CustomerDocSource, "docDate" | "createdAt">): string {
  return ledgerDayFromDate(doc.docDate ?? doc.createdAt);
}

export function isIsoDayInRange(
  isoDay: string,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): boolean {
  if (!isoDay) return false;
  const from = dateFrom?.trim() || "";
  const to = dateTo?.trim() || "";
  if (from && isoDay < from) return false;
  if (to && isoDay > to) return false;
  return true;
}

export function isIsoDayBefore(isoDay: string, dateFrom: string | null | undefined): boolean {
  const from = dateFrom?.trim() || "";
  if (!from) return false;
  return Boolean(isoDay) && isoDay < from;
}

export function isCustomerCreditNote(documentType: string | null | undefined): boolean {
  const raw = (documentType ?? "").trim();
  if (!raw) return false;
  if (raw === CUSTOMER_CREDIT_NOTE_TYPE) return true;
  const n = raw.toLowerCase().replace(/\s+/g, " ");
  return (
    n === "חשבונית זיכוי" ||
    n === "credit note" ||
    n === "creditnote" ||
    n.includes("credit note") ||
    /إشعار\s*دائن/.test(raw) ||
    /اشعار\s*دائن/.test(raw)
  );
}

function money(value: unknown): number {
  return Math.abs(finiteAmount(value));
}

export function customerEventsFromSources(params: {
  entityId: string;
  entityName: string;
  documents: CustomerDocSource[];
  payments: CustomerPaymentSource[];
}): LedgerCalcEvent[] {
  const events: LedgerCalcEvent[] = [];

  for (const doc of params.documents) {
    const creditNote = isCustomerCreditNote(doc.documentType);
    if ((doc.category ?? "").trim() !== "הכנסה" && !creditNote) continue;
    const date = customerDocDay(doc);
    const amount = money(doc.totalAmount);
    events.push({
      id: `doc-${doc.id}`,
      date,
      sortKey: `${date}|${ledgerDayFromDate(doc.createdAt)}|${doc.id}`,
      debit: creditNote ? 0 : amount,
      credit: creditNote ? amount : 0,
      kind: creditNote ? "credit_note" : "charge",
      docType: doc.documentType,
      description: doc.title,
      documentId: doc.id,
    });
  }

  for (const payment of params.payments) {
    const date = ledgerDayFromDate(payment.createdAt);
    const amount = money(payment.amount);
    const note = payment.documentTitle?.trim() ? ` — ${payment.documentTitle.trim()}` : "";
    events.push({
      id: `pay-${payment.id}`,
      date,
      sortKey: `${date}|${ledgerDayFromDate(payment.createdAt)}|${payment.id}`,
      debit: 0,
      credit: amount,
      kind: "payment",
      docType: "תשלום",
      description: `תשלום${note}`,
      documentId: payment.documentId ?? null,
    });
  }

  return events;
}

export function entryEventsFromSources(entries: EntrySource[]): LedgerCalcEvent[] {
  return entries.map((row) => {
    const date = ledgerDayFromDate(row.entryDate);
    const created = ledgerDayFromDate(row.createdAt ?? row.entryDate);
    return {
      id: row.id,
      date,
      sortKey: `${date}|${created}|${row.id}`,
      debit: Math.max(0, finiteAmount(row.debit)),
      credit: Math.max(0, finiteAmount(row.credit)),
      kind: "adjustment",
      docType: row.docType,
      description: row.description,
      documentId: row.financialDocumentId ?? null,
    };
  });
}

function eventDelta(event: LedgerCalcEvent): number {
  return finiteAmount(event.debit) - finiteAmount(event.credit);
}

function compareEvents(a: LedgerCalcEvent, b: LedgerCalcEvent): number {
  if (a.sortKey < b.sortKey) return -1;
  if (a.sortKey > b.sortKey) return 1;
  return a.id.localeCompare(b.id);
}

export function computeLedgerStatement(params: {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  openingBalance: number;
  events: LedgerCalcEvent[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  const opening = finiteAmount(params.openingBalance);
  const dateFrom = params.dateFrom?.trim() || null;
  const dateTo = params.dateTo?.trim() || null;
  const sorted = [...params.events].sort(compareEvents);

  let periodOpening = opening;
  const periodEvents: LedgerCalcEvent[] = [];

  for (const event of sorted) {
    if (isIsoDayBefore(event.date, dateFrom)) {
      periodOpening += eventDelta(event);
      continue;
    }
    if (!isIsoDayInRange(event.date, dateFrom, dateTo)) continue;
    periodEvents.push(event);
  }

  const movements: LedgerComputedMovement[] = [];
  let running = periodOpening;
  let periodDebit = 0;
  let periodCredit = 0;
  let charges = 0;
  let payments = 0;
  let creditNotes = 0;
  let adjustments = 0;

  for (const event of periodEvents) {
    const debit = finiteAmount(event.debit);
    const credit = finiteAmount(event.credit);
    const before = running;
    running += debit - credit;
    periodDebit += debit;
    periodCredit += credit;
    if (event.kind === "charge") charges += debit;
    else if (event.kind === "payment") payments += credit;
    else if (event.kind === "credit_note") creditNotes += credit;
    else adjustments += debit - credit;

    movements.push({
      id: event.id,
      entity_id: params.entityId,
      entity_name: params.entityName,
      entity_type: params.entityType,
      entry_date: event.date,
      doc_type: event.docType,
      description: event.description,
      debit,
      credit,
      document_id: event.documentId ?? null,
      open_balance: running,
      balance_before: before,
      balance_after: running,
    });
  }

  const split = splitSignedBalance(running);
  const explain: LedgerExplain = {
    opening: periodOpening,
    charges,
    payments,
    creditNotes,
    adjustments,
    current: running,
  };

  return {
    entityType: params.entityType,
    periodOpening,
    signedBalance: split.signedBalance,
    debt: split.debt,
    credit: split.credit,
    periodDebit,
    periodCredit,
    movementCount: movements.length,
    explain,
    movements,
  };
}

export function computeCustomerLedger(params: {
  entityId: string;
  entityName: string;
  openingBalance: number;
  documents: CustomerDocSource[];
  payments: CustomerPaymentSource[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  return computeLedgerStatement({
    entityType: "customer",
    entityId: params.entityId,
    entityName: params.entityName,
    openingBalance: params.openingBalance,
    events: customerEventsFromSources(params),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}

export function computeEntryLedger(params: {
  entityType: "supplier" | "employee";
  entityId: string;
  entityName: string;
  openingBalance: number;
  entries: EntrySource[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): LedgerStatement {
  return computeLedgerStatement({
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    openingBalance: params.openingBalance,
    events: entryEventsFromSources(params.entries),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}

export function amountsNearlyEqual(a: number, b: number): boolean {
  return Math.abs(finiteAmount(a) - finiteAmount(b)) < 1e-6;
}

export function explainTiesToSigned(explain: LedgerExplain): boolean {
  const rebuilt =
    finiteAmount(explain.opening) +
    finiteAmount(explain.charges) -
    finiteAmount(explain.payments) -
    finiteAmount(explain.creditNotes) +
    finiteAmount(explain.adjustments);
  return amountsNearlyEqual(rebuilt, explain.current);
}
