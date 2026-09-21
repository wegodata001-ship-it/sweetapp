/**
 * כרטסת מעודכנת presentation — all numbers from ledger-engine.
 * Run: npx tsx --test src/lib/finance/ledger-v2.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FUTURE_ORDER_LEDGER_V2_POLICY,
  aggregateLedgerV2Totals,
  buildCustomerStatements,
  customerMatchesSearch,
  detailFromCustomerStatement,
  displaySide,
  filterLedgerV2Rows,
  rowFromCustomerStatement,
  statementFromExplicitMovements,
} from "./ledger-v2";
import { statementForCustomer, statementForEntryEntity } from "./ledger-route-map";

function day(ymd: string) {
  return new Date(`${ymd}T12:00:00.000Z`);
}

const invoice = (id: string, amount: number, ymd: string, type = "חשבונית מס", customerId = "c1") => ({
  id,
  customerId,
  documentType: type,
  category: "הכנסה",
  title: id,
  totalAmount: amount,
  docDate: day(ymd),
  createdAt: day(ymd),
});

const payment = (id: string, amount: number, ymd: string, customerId = "c1") => ({
  id,
  customerId,
  amount,
  createdAt: day(ymd),
  documentId: null,
  documentTitle: null,
});

function customerRow(params: Parameters<typeof statementForCustomer>[0]) {
  const statement = statementForCustomer(params);
  return {
    statement,
    row: rowFromCustomerStatement(
      { id: params.id, name: params.name, openingBalance: params.openingBalance },
      statement,
    ),
    detail: detailFromCustomerStatement({
      customer: { id: params.id, name: params.name, openingBalance: params.openingBalance },
      statement,
    }),
  };
}

describe("Customer debt", () => {
  it("invoice 100 → debt 100", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [],
    });
    assert.equal(row.debt, 100);
    assert.equal(row.credit, 0);
    assert.equal(row.signedBalance, 100);
    assert.equal(displaySide(row.signedBalance).side, "DEBT");
  });
});

describe("Customer credit", () => {
  it("overpay → credit 20", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 120, "2026-09-02")],
    });
    assert.equal(row.debt, 0);
    assert.equal(row.credit, 20);
    assert.equal(row.signedBalance, -20);
    assert.equal(displaySide(row.signedBalance).amount, 20);
    assert.equal(displaySide(row.signedBalance).side, "CREDIT");
  });
});

describe("Customer zero", () => {
  it("exact pay → balanced", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 100, "2026-09-02")],
    });
    assert.equal(row.side, "ZERO");
    assert.equal(row.signedBalance, 0);
  });
});

describe("Opening balance", () => {
  it("appears as first movement and feeds signed balance", () => {
    const { statement, row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 80,
      documents: [],
      payments: [payment("p1", 30, "2026-09-02")],
    });
    assert.equal(statement.movements[0]?.type, "OPENING_BALANCE");
    assert.equal(row.signedBalance, 50);
  });
});

describe("Payment", () => {
  it("reduces charges", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 40, "2026-09-02")],
    });
    assert.equal(row.charges, 100);
    assert.equal(row.payments, 40);
    assert.equal(row.signedBalance, 60);
  });
});

describe("Overpayment", () => {
  it("does not clamp credit", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 150, "2026-09-02")],
    });
    assert.equal(row.credit, 50);
    assert.equal(row.debt, 0);
  });
});

describe("Credit note", () => {
  it("reduces debt", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01"), invoice("cn", 25, "2026-09-03", "חשבונית זיכוי")],
      payments: [],
    });
    assert.equal(row.creditNotes, 25);
    assert.equal(row.signedBalance, 75);
  });
});

describe("Fee", () => {
  it("increases signed balance through the same engine", () => {
    const statement = statementFromExplicitMovements({
      entityType: "customer",
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      movements: [
        { id: "i1", date: "2026-09-01", type: "INVOICE", amount: 100, description: "inv" },
        { id: "f1", date: "2026-09-02", type: "FEE", amount: 10, description: "fee" },
      ],
    });
    const row = rowFromCustomerStatement({ id: "c1", name: "A", openingBalance: 0 }, statement);
    assert.equal(row.fees, 10);
    assert.equal(row.signedBalance, 110);
  });
});

describe("Adjustment", () => {
  it("applies stored debit and credit", () => {
    const statement = statementFromExplicitMovements({
      entityType: "customer",
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      movements: [
        { id: "i1", date: "2026-09-01", type: "INVOICE", amount: 100, description: "inv" },
        { id: "a1", date: "2026-09-02", type: "ADJUSTMENT", debit: 0, credit: 15, description: "adj" },
      ],
    });
    assert.equal(statement.signedBalance, 85);
    assert.equal(statement.explain.adjustments, -15);
  });
});

describe("Running balance", () => {
  it("continues after every movement including overpay", () => {
    const { detail } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 120, "2026-09-02")],
    });
    assert.equal(detail.movements[0]?.balanceAfter, 100);
    assert.equal(detail.movements[1]?.balanceAfter, -20);
    assert.equal(detail.signedBalance, detail.movements.at(-1)?.balanceAfter);
  });
});

describe("Date filter", () => {
  it("keeps September movements only after brought forward", () => {
    const { statement } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("aug", 5000, "2026-08-10"), invoice("sep", 1000, "2026-09-02")],
      payments: [payment("p1", 2000, "2026-09-20")],
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    const types = statement.movements.map((m) => m.type);
    assert.equal(types[0], "BALANCE_BROUGHT_FORWARD");
    assert.ok(types.includes("INVOICE"));
    assert.ok(types.includes("PAYMENT"));
  });
});

describe("Brought forward", () => {
  it("does not start from 0", () => {
    const { statement, row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("aug", 5000, "2026-08-10"), invoice("sep", 1000, "2026-09-02")],
      payments: [payment("p1", 2000, "2026-09-20")],
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    assert.equal(statement.periodOpening, 5000);
    assert.equal(row.signedBalance, 4000);
  });
});

describe("Same name / different IDs", () => {
  it("does not merge", () => {
    const built = buildCustomerStatements({
      customers: [
        { id: "c-a", name: "כרמל", openingBalance: 0 },
        { id: "c-b", name: "כרמל", openingBalance: 0 },
      ],
      documents: [invoice("i1", 100, "2026-09-01", "חשבונית מס", "c-a"), invoice("i2", 30, "2026-09-01", "חשבונית מס", "c-b")],
      payments: [],
    });
    assert.equal(built.rows[0]?.signedBalance, 100);
    assert.equal(built.rows[1]?.signedBalance, 30);
  });
});

describe("Multi-role", () => {
  it("customer ledger stays separate from a same-name supplier", () => {
    const customer = statementForCustomer({
      id: "c-1",
      name: "אלבאבי",
      openingBalance: 0,
      documents: [invoice("i1", 80, "2026-09-01", "חשבונית מס", "c-1")],
      payments: [],
    });
    const supplier = statementForEntryEntity({
      entityType: "supplier",
      id: "s-1",
      name: "אלבאבי",
      openingBalance: 0,
      entries: [
        {
          id: "e1",
          supplierId: "s-1",
          debit: 50,
          credit: 0,
          entryDate: day("2026-09-01"),
          docType: "הוצאה",
          description: "Buy",
        },
      ],
    });
    assert.notEqual(customer.entityId, supplier.entityId);
    assert.equal(customer.signedBalance, 80);
    assert.equal(supplier.signedBalance, 50);
  });
});

describe("No movements", () => {
  it("opening 0 stays zero", () => {
    const { row } = customerRow({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [],
      payments: [],
    });
    assert.equal(row.signedBalance, 0);
    assert.equal(row.movementCount, 0);
  });
});

describe("Overview total == customer statements totals", () => {
  it("aggregates the same signed sides as each statement", () => {
    const built = buildCustomerStatements({
      customers: [
        { id: "c1", name: "A", openingBalance: 0 },
        { id: "c2", name: "B", openingBalance: 0 },
        { id: "c3", name: "C", openingBalance: 0 },
      ],
      documents: [
        invoice("i1", 100, "2026-09-01", "חשבונית מס", "c1"),
        invoice("i2", 50, "2026-09-01", "חשבונית מס", "c2"),
      ],
      payments: [payment("p1", 120, "2026-09-02", "c1"), payment("p2", 50, "2026-09-02", "c2")],
    });
    const totals = aggregateLedgerV2Totals(built.rows);
    const debtSum = built.statements.reduce((s, st) => s + st.debt, 0);
    const creditSum = built.statements.reduce((s, st) => s + st.credit, 0);
    const paySum = built.statements.reduce((s, st) => s + st.explain.payments, 0);
    const chargeSum = built.statements.reduce((s, st) => s + st.explain.invoices, 0);
    assert.equal(totals.totalDebt, debtSum);
    assert.equal(totals.totalCredit, creditSum);
    assert.equal(totals.totalPayments, paySum);
    assert.equal(totals.totalCharges, chargeSum);
    assert.equal(totals.customersWithCredit, 1);
    assert.equal(totals.customersBalanced, 2);
    assert.equal(filterLedgerV2Rows(built.rows, "CREDIT").length, 1);
  });
});

describe("search + order policy", () => {
  it("matches phone digits and id", () => {
    const c = { id: "cust-9", name: "עומר", phone: "050-1234567", openingBalance: 0 };
    assert.equal(customerMatchesSearch(c, "1234"), true);
    assert.equal(customerMatchesSearch(c, "cust-9"), true);
    assert.equal(customerMatchesSearch(c, "לא קיים"), false);
  });

  it("keeps FutureOrder out of the ledger", () => {
    assert.equal(FUTURE_ORDER_LEDGER_V2_POLICY.included, false);
  });
});
