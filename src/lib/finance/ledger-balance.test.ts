/**
 * Ledger signed-balance SSOT tests (no DB).
 * Run: npx tsx --test src/lib/finance/ledger-balance.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEDGER_CURRENCY,
  LEDGER_SIGNED_SEMANTICS,
  MULTI_CURRENCY_LEDGER_SUPPORTED,
  ORDER_PAYMENT_LEDGER_POLICY,
  computeCustomerLedger,
  computeEntryLedger,
  explainTiesToSigned,
  isCustomerCreditNote,
  splitSignedBalance,
  type CustomerDocSource,
  type CustomerPaymentSource,
} from "./ledger-balance";

function day(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function invoice(
  id: string,
  amount: number,
  ymd: string,
  type = "חשבונית מס",
): CustomerDocSource {
  return {
    id,
    category: "הכנסה",
    documentType: type,
    title: `${type} ${id}`,
    totalAmount: amount,
    docDate: day(ymd),
    createdAt: day(ymd),
  };
}

function payment(id: string, amount: number, ymd: string): CustomerPaymentSource {
  return {
    id,
    amount,
    createdAt: day(ymd),
    documentId: null,
    documentTitle: null,
  };
}

describe("signed balance SSOT", () => {
  it("does not clamp a negative signed balance before the split", () => {
    const split = splitSignedBalance(1000 - 1100);
    assert.equal(split.signedBalance, -100);
    assert.equal(split.debt, 0);
    assert.equal(split.credit, 100);
  });

  it("Opening 0, charges 1000, payments 400 → Debt 600 / Credit 0", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("d1", 1000, "2026-09-02")],
      payments: [payment("p1", 400, "2026-09-10")],
    });
    assert.equal(s.signedBalance, 600);
    assert.equal(s.debt, 600);
    assert.equal(s.credit, 0);
    assert.equal(explainTiesToSigned(s.explain), true);
  });

  it("Opening 0, charges 1000, payments 1100 → Debt 0 / Credit 100", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("d1", 1000, "2026-09-02")],
      payments: [payment("p1", 1100, "2026-09-10")],
    });
    assert.equal(s.signedBalance, -100);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 100);
  });

  it("Opening debt 500, charges 1000, payments 400 → Debt 1100", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 500,
      documents: [invoice("d1", 1000, "2026-09-02")],
      payments: [payment("p1", 400, "2026-09-10")],
    });
    assert.equal(s.signedBalance, 1100);
    assert.equal(s.debt, 1100);
    assert.equal(s.credit, 0);
    assert.equal(LEDGER_SIGNED_SEMANTICS.customer.openingPositive, "DEBT");
  });

  it("Opening credit 500, charges 1000, payments 400 → Debt 100", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: -500,
      documents: [invoice("d1", 1000, "2026-09-02")],
      payments: [payment("p1", 400, "2026-09-10")],
    });
    assert.equal(s.signedBalance, 100);
    assert.equal(s.debt, 100);
    assert.equal(s.credit, 0);
    assert.equal(LEDGER_SIGNED_SEMANTICS.customer.openingNegative, "CREDIT");
  });

  it("Invoice 1000 + credit note 200 → Debt 800", () => {
    assert.equal(isCustomerCreditNote("חשבונית זיכוי"), true);
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [
        invoice("inv", 1000, "2026-09-02", "חשבונית מס"),
        invoice("cn", 200, "2026-09-05", "חשבונית זיכוי"),
      ],
      payments: [],
    });
    assert.equal(s.signedBalance, 800);
    assert.equal(s.debt, 800);
    assert.equal(s.explain.charges, 1000);
    assert.equal(s.explain.creditNotes, 200);
    assert.equal(s.movements.find((m) => m.doc_type === "חשבונית זיכוי")?.credit, 200);
    assert.equal(s.movements.find((m) => m.doc_type === "חשבונית זיכוי")?.debit, 0);
  });

  it("credit note direction does not depend on category", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [
        invoice("inv", 1000, "2026-09-02", "חשבונית מס"),
        {
          id: "cn",
          category: "אחר",
          documentType: "חשבונית זיכוי",
          title: "זיכוי",
          totalAmount: 200,
          docDate: day("2026-09-06"),
          createdAt: day("2026-09-06"),
        },
      ],
      payments: [],
    });
    assert.equal(s.signedBalance, 800);
  });

  it("date filter uses prior balance: 5000 then +1000 -2000 → closing 4000", () => {
    const sources = {
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [
        invoice("prior", 5000, "2026-08-31"),
        invoice("sep", 1000, "2026-09-10"),
      ],
      payments: [payment("sep-pay", 2000, "2026-09-20")],
    };
    const september = computeCustomerLedger({
      ...sources,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    assert.equal(september.periodOpening, 5000);
    assert.equal(september.signedBalance, 4000);
    assert.equal(september.debt, 4000);
    assert.equal(september.movementCount, 2);
    assert.equal(september.explain.opening, 5000);
    assert.equal(september.explain.charges, 1000);
    assert.equal(september.explain.payments, 2000);
    assert.equal(september.explain.current, 4000);

    const allTime = computeCustomerLedger(sources);
    assert.equal(allTime.signedBalance, september.signedBalance);
  });

  it("running balance is continuous across an overpayment", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 1000,
      documents: [],
      payments: [payment("a", 400, "2026-09-02"), payment("b", 700, "2026-09-10")],
    });
    assert.equal(s.movements[0]?.balance_before, 1000);
    assert.equal(s.movements[0]?.balance_after, 600);
    assert.equal(s.movements[1]?.balance_before, 600);
    assert.equal(s.movements[1]?.balance_after, -100);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 100);
  });
});

describe("statement is internally consistent without live overview types", () => {
  it("customer signed balance equals last movement running balance", () => {
    const statement = computeCustomerLedger({
      entityId: "c1",
      entityName: "לקוח",
      openingBalance: 500,
      documents: [invoice("d1", 1000, "2026-09-02")],
      payments: [payment("p1", 400, "2026-09-10")],
    });
    const last = statement.movements[statement.movements.length - 1];
    assert.equal(statement.signedBalance, last?.balance_after);
    assert.equal(statement.signedBalance, statement.debt - statement.credit);
    assert.equal(statement.periodDebit, 1000);
    assert.equal(statement.periodCredit, 400);
  });
});

describe("supplier and employee semantics stay on LedgerEntry formula", () => {
  it("supplier: opening + debit − credit, credit preserved when overpaid", () => {
    assert.equal(LEDGER_SIGNED_SEMANTICS.supplier.debt, "We owe the supplier (AP)");
    const s = computeEntryLedger({
      entityType: "supplier",
      entityId: "s1",
      entityName: "ספק",
      openingBalance: 1000,
      entries: [
        {
          id: "e1",
          debit: 0,
          credit: 1100,
          entryDate: day("2026-09-10"),
          createdAt: day("2026-09-10"),
          docType: "תשלום ספק",
          description: "תשלום",
        },
      ],
    });
    assert.equal(s.signedBalance, -100);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 100);
  });

  it("employee uses the same signed formula, not the customer document engine", () => {
    assert.equal(LEDGER_SIGNED_SEMANTICS.employee.formula, "opening + ledgerDebit − ledgerCredit");
    const s = computeEntryLedger({
      entityType: "employee",
      entityId: "e1",
      entityName: "עובד",
      openingBalance: 200,
      entries: [
        {
          id: "w1",
          debit: 300,
          credit: 0,
          entryDate: day("2026-09-01"),
          docType: "שכר",
          description: "שכר",
        },
        {
          id: "w2",
          debit: 0,
          credit: 100,
          entryDate: day("2026-09-15"),
          docType: "תשלום",
          description: "תשלום",
        },
      ],
    });
    assert.equal(s.signedBalance, 400);
    assert.equal(s.debt, 400);
    assert.equal(s.movements[0]?.balance_after, 500);
    assert.equal(s.movements[1]?.balance_after, 400);
  });

  it("supplier period filter keeps prior LedgerEntry balance", () => {
    const s = computeEntryLedger({
      entityType: "supplier",
      entityId: "s1",
      entityName: "ספק",
      openingBalance: 0,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      entries: [
        {
          id: "aug",
          debit: 5000,
          credit: 0,
          entryDate: day("2026-08-20"),
          docType: "חשבונית",
          description: "אוגוסט",
        },
        {
          id: "sep-d",
          debit: 1000,
          credit: 0,
          entryDate: day("2026-09-05"),
          docType: "חשבונית",
          description: "ספטמבר",
        },
        {
          id: "sep-c",
          debit: 0,
          credit: 2000,
          entryDate: day("2026-09-18"),
          docType: "תשלום",
          description: "תשלום",
        },
      ],
    });
    assert.equal(s.periodOpening, 5000);
    assert.equal(s.signedBalance, 4000);
  });
});

describe("policy constants", () => {
  it("does not treat OrderPayment as proven ledger input", () => {
    assert.equal(ORDER_PAYMENT_LEDGER_POLICY.status, "UNPROVEN");
    assert.match(ORDER_PAYMENT_LEDGER_POLICY.current, /CashFlowEntry/);
  });

  it("documents that multi-currency is not supported and stays ILS", () => {
    assert.equal(MULTI_CURRENCY_LEDGER_SUPPORTED, false);
    assert.equal(LEDGER_CURRENCY, "ILS");
  });
});
