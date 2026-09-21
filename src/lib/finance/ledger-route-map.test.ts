/**
 * Overview and movements share ledger-route-map.
 * Run: npx tsx --test src/lib/finance/ledger-route-map.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  movementsPayload,
  overviewRowFromEntityStatement,
  statementForCustomer,
  statementForEntryEntity,
} from "./ledger-route-map";

function day(ymd: string) {
  return new Date(`${ymd}T12:00:00.000Z`);
}

const invoice = (id: string, amount: number, ymd: string, type = "חשבונית מס") => ({
  id,
  customerId: "c1",
  documentType: type,
  category: "הכנסה",
  title: id,
  totalAmount: amount,
  docDate: day(ymd),
  createdAt: day(ymd),
});

const payment = (id: string, amount: number, ymd: string) => ({
  id,
  customerId: "c1",
  amount,
  createdAt: day(ymd),
  documentId: null,
  documentTitle: null,
});

function both(params: Parameters<typeof statementForCustomer>[0]) {
  const statement = statementForCustomer(params);
  const overview = overviewRowFromEntityStatement(
    {
      entity_type: "customer",
      id: params.id,
      name: params.name,
      opening_balance: params.openingBalance,
    },
    statement,
  );
  const movements = movementsPayload(statement);
  return { statement, overview, movements };
}

describe("1. Overview debt", () => {
  it("invoice 100 → debt 100", () => {
    const { overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [],
    });
    assert.equal(overview.debt, 100);
    assert.equal(overview.credit, 0);
    assert.equal(overview.open_balance, 100);
  });
});

describe("2. Overview credit", () => {
  it("overpay → credit 20", () => {
    const { overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 120, "2026-09-02")],
    });
    assert.equal(overview.debt, 0);
    assert.equal(overview.credit, 20);
    assert.equal(overview.open_balance, -20);
    assert.equal(overview.side, "CREDIT");
  });
});

describe("3. Overview zero", () => {
  it("pay exactly → zero", () => {
    const { overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 100, "2026-09-02")],
    });
    assert.equal(overview.open_balance, 0);
    assert.equal(overview.side, "ZERO");
  });
});

describe("4. Movements running balance", () => {
  it("each line has continuous running balance", () => {
    const { movements } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 40, "2026-09-02")],
    });
    assert.equal(movements.movements[0]?.open_balance, 100);
    assert.equal(movements.movements[1]?.open_balance, 60);
  });
});

describe("5. Opening balance", () => {
  it("opening 80 is first movement and part of signed balance", () => {
    const { statement, overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 80,
      documents: [],
      payments: [payment("p1", 30, "2026-09-02")],
    });
    assert.equal(statement.movements[0]?.type, "OPENING_BALANCE");
    assert.equal(overview.open_balance, 50);
  });
});

describe("6. Credit note", () => {
  it("reduces debt", () => {
    const { overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01"), invoice("cn", 25, "2026-09-03", "חשבונית זיכוי")],
      payments: [],
    });
    assert.equal(overview.open_balance, 75);
  });
});

describe("7. Overpayment → credit", () => {
  it("does not clamp", () => {
    const { movements } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [payment("p1", 120, "2026-09-02")],
    });
    assert.equal(movements.credit, 20);
    assert.equal(movements.openDebt, 0);
    assert.equal(movements.signedBalance, -20);
  });
});

describe("8. Date range → brought forward", () => {
  it("does not start from 0", () => {
    const { statement, overview } = both({
      id: "c1",
      name: "A",
      openingBalance: 0,
      documents: [invoice("aug", 5000, "2026-08-10"), invoice("sep", 1000, "2026-09-02")],
      payments: [payment("p1", 2000, "2026-09-20")],
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    assert.equal(statement.movements[0]?.type, "BALANCE_BROUGHT_FORWARD");
    assert.equal(statement.periodOpening, 5000);
    assert.equal(overview.open_balance, 4000);
  });
});

describe("9. Supplier", () => {
  it("uses the same engine", () => {
    const statement = statementForEntryEntity({
      entityType: "supplier",
      id: "s1",
      name: "ספק",
      openingBalance: 200,
      entries: [
        {
          id: "e1",
          supplierId: "s1",
          debit: 500,
          credit: 0,
          entryDate: day("2026-09-01"),
          docType: "הוצאה",
          description: "Buy",
        },
      ],
    });
    const overview = overviewRowFromEntityStatement(
      { entity_type: "supplier", id: "s1", name: "ספק", opening_balance: 200 },
      statement,
    );
    const movements = movementsPayload(statement);
    assert.equal(overview.open_balance, movements.signedBalance);
    assert.equal(overview.open_balance, 700);
  });
});

describe("10. Employee", () => {
  it("uses the same engine", () => {
    const statement = statementForEntryEntity({
      entityType: "employee",
      id: "e1",
      name: "עובד",
      openingBalance: 200,
      entries: [
        {
          id: "sal",
          employeeId: "e1",
          debit: 300,
          credit: 0,
          entryDate: day("2026-09-01"),
          docType: "שכר",
          description: "Salary",
        },
      ],
    });
    assert.equal(statement.signedBalance, 500);
    assert.equal(movementsPayload(statement).signedBalance, 500);
  });
});

describe("11. Same name different IDs", () => {
  it("does not merge", () => {
    const a = statementForCustomer({
      id: "c-a",
      name: "כרמל",
      openingBalance: 0,
      documents: [{ ...invoice("i1", 100, "2026-09-01"), customerId: "c-a" }],
      payments: [],
    });
    const b = statementForCustomer({
      id: "c-b",
      name: "כרמל",
      openingBalance: 0,
      documents: [{ ...invoice("i2", 30, "2026-09-01"), customerId: "c-b" }],
      payments: [],
    });
    assert.notEqual(a.entityId, b.entityId);
    assert.equal(a.signedBalance, 100);
    assert.equal(b.signedBalance, 30);
  });
});

describe("12. Multi-role", () => {
  it("customer and supplier stay separate", () => {
    const customer = statementForCustomer({
      id: "c-1",
      name: "אלבאבי",
      openingBalance: 0,
      documents: [{ ...invoice("i1", 80, "2026-09-01"), customerId: "c-1" }],
      payments: [],
    });
    const supplier = statementForEntryEntity({
      entityType: "supplier",
      id: "s-1",
      name: "אלבאבי",
      openingBalance: 0,
      entries: [
        {
          id: "p1",
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

describe("13. Overview final balance == Movements final balance", () => {
  it("uses the same signed balance for every case above", () => {
    const cases = [
      both({
        id: "c1",
        name: "A",
        openingBalance: 500,
        documents: [invoice("i1", 1000, "2026-09-01"), invoice("cn", 200, "2026-09-03", "חשבונית זיכוי")],
        payments: [payment("p1", 1400, "2026-09-10")],
      }),
      both({
        id: "c1",
        name: "A",
        openingBalance: 0,
        documents: [invoice("aug", 5000, "2026-08-10"), invoice("sep", 1000, "2026-09-02")],
        payments: [payment("p1", 2000, "2026-09-20")],
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
      }),
    ];
    for (const row of cases) {
      assert.equal(row.overview.open_balance, row.movements.signedBalance);
      assert.equal(row.overview.signed_balance, row.statement.signedBalance);
      assert.equal(row.overview.debt, row.movements.debt);
      assert.equal(row.overview.credit, row.movements.credit);
    }
  });
});
