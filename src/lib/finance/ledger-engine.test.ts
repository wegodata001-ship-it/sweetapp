/**
 * Ledger engine tests. Run: npx tsx --test src/lib/finance/ledger-engine.test.ts
 * The engine is not wired to live /api/ledger routes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOVEMENT_RULES,
  ORDER_PAYMENT_LEDGER_POLICY,
  computeCustomerLedger,
  computeEntryLedger,
  computeLedgerStatement,
  isCreditNoteType,
  splitSignedBalance,
  type LedgerInputMovement,
} from "./ledger-engine";

function d(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function invoice(id: string, amount: number, ymd: string, type = "חשבונית מס"): Parameters<
  typeof computeCustomerLedger
>[0]["documents"][number] {
  return {
    id,
    documentType: type,
    category: "הכנסה",
    title: `Invoice ${id}`,
    totalAmount: amount,
    docDate: d(ymd),
    createdAt: d(ymd),
  };
}

function pay(id: string, amount: number, ymd: string) {
  return { id, amount, createdAt: d(ymd), documentId: null, documentTitle: null };
}

function assertRunning(statement: ReturnType<typeof computeLedgerStatement>) {
  let expected = statement.movements[0]?.balance_before ?? 0;
  for (const row of statement.movements) {
    assert.equal(row.balance_before, expected);
    expected = row.balance_before + row.debit - row.credit;
    assert.equal(row.balance_after, expected);
  }
  if (statement.movements.length) {
    assert.equal(statement.signedBalance, statement.movements.at(-1)?.balance_after);
  }
}

describe("1. Customer owes 100", () => {
  it("invoice 100 → debt 100 / credit 0", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [],
    });
    assert.equal(s.signedBalance, 100);
    assert.equal(s.debt, 100);
    assert.equal(s.credit, 0);
    assert.equal(s.side, "DEBT");
    assertRunning(s);
  });
});

describe("2. Customer pays 100 → 0", () => {
  it("invoice 100 + payment 100 → zero", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [pay("p1", 100, "2026-09-02")],
    });
    assert.equal(s.signedBalance, 0);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 0);
    assert.equal(s.side, "ZERO");
    assertRunning(s);
  });
});

describe("3. Customer pays 120 → Credit 20", () => {
  it("does not clamp the overpayment", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [pay("p1", 120, "2026-09-02")],
    });
    assert.equal(s.signedBalance, -20);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 20);
    assert.equal(s.side, "CREDIT");
    assert.equal(splitSignedBalance(-20).credit, 20);
    assertRunning(s);
  });
});

describe("4. Opening debt + payment", () => {
  it("opening 80 + payment 30 → debt 50", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 80,
      documents: [],
      payments: [pay("p1", 30, "2026-09-02")],
    });
    assert.equal(s.movements[0]?.type, "OPENING_BALANCE");
    assert.equal(s.signedBalance, 50);
    assert.equal(s.debt, 50);
    assertRunning(s);
  });
});

describe("5. Opening credit", () => {
  it("opening -40 is customer credit", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: -40,
      documents: [],
      payments: [],
    });
    assert.equal(s.movements[0]?.type, "OPENING_BALANCE");
    assert.equal(s.movements[0]?.credit, 40);
    assert.equal(s.signedBalance, -40);
    assert.equal(s.credit, 40);
    assert.equal(s.side, "CREDIT");
    assertRunning(s);
  });
});

describe("6. Credit note", () => {
  it("invoice 100 + credit note 25 → debt 75", () => {
    assert.equal(isCreditNoteType("חשבונית זיכוי"), true);
    assert.equal(MOVEMENT_RULES.CREDIT_NOTE.direction, "credit");
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01"), invoice("cn", 25, "2026-09-03", "חשבונית זיכוי")],
      payments: [],
    });
    assert.equal(s.signedBalance, 75);
    assert.equal(s.explain.creditNotes, 25);
    assert.equal(s.movements.find((m) => m.type === "CREDIT_NOTE")?.credit, 25);
    assert.equal(s.movements.find((m) => m.type === "CREDIT_NOTE")?.debit, 0);
    assertRunning(s);
  });

  it("credit note direction does not depend on category", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [
        invoice("i1", 100, "2026-09-01"),
        {
          id: "cn",
          documentType: "חשבונית זיכוי",
          category: "אחר",
          title: "CN",
          totalAmount: 25,
          docDate: d("2026-09-03"),
          createdAt: d("2026-09-03"),
        },
      ],
      payments: [],
    });
    assert.equal(s.signedBalance, 75);
  });
});

describe("7. Multiple payments", () => {
  it("100 invoice − 40 − 50 → debt 10", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [pay("p1", 40, "2026-09-02"), pay("p2", 50, "2026-09-04")],
    });
    assert.equal(s.signedBalance, 10);
    assert.equal(s.explain.payments, 90);
    assertRunning(s);
  });
});

describe("8. Fees", () => {
  it("invoice 100 + fee 10 → debt 110", () => {
    const fee: LedgerInputMovement = {
      id: "fee-1",
      date: "2026-09-02",
      type: "FEE",
      amount: 10,
      description: "עמלה",
    };
    const s = computeLedgerStatement({
      entityType: "customer",
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      movements: [
        {
          id: "i1",
          date: "2026-09-01",
          type: "INVOICE",
          amount: 100,
          description: "Invoice",
        },
        fee,
      ],
    });
    assert.equal(MOVEMENT_RULES.FEE.direction, "debit");
    assert.equal(s.signedBalance, 110);
    assert.equal(s.explain.fees, 10);
    assertRunning(s);
  });
});

describe("9. Date range with prior opening", () => {
  it("prior 5000 then +1000 −2000 in September → 4000", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 0,
      documents: [invoice("aug", 5000, "2026-08-10"), invoice("sep", 1000, "2026-09-02")],
      payments: [pay("p1", 2000, "2026-09-20")],
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    assert.equal(s.movements[0]?.type, "BALANCE_BROUGHT_FORWARD");
    assert.equal(s.periodOpening, 5000);
    assert.equal(s.signedBalance, 4000);
    assert.notEqual(s.periodOpening, 0);
    assertRunning(s);
  });
});

describe("10. Customer with no movements", () => {
  it("opening 0 and no events → zero statement", () => {
    const s = computeCustomerLedger({
      entityId: "c-empty",
      entityName: "Empty",
      openingBalance: 0,
      documents: [],
      payments: [],
    });
    assert.equal(s.signedBalance, 0);
    assert.equal(s.movements.length, 0);
    assert.equal(s.debt, 0);
    assert.equal(s.credit, 0);
  });
});

describe("11. Supplier ledger", () => {
  it("uses the same signed formula", () => {
    const s = computeEntryLedger({
      entityType: "supplier",
      entityId: "s1",
      entityName: "ספק",
      openingBalance: 200,
      entries: [
        {
          id: "e1",
          debit: 500,
          credit: 0,
          entryDate: d("2026-09-01"),
          docType: "הוצאה",
          description: "Purchase",
        },
        {
          id: "e2",
          debit: 0,
          credit: 100,
          entryDate: d("2026-09-03"),
          docType: "תשלום",
          description: "Payment",
        },
      ],
    });
    assert.equal(s.entityType, "supplier");
    assert.equal(s.signedBalance, 600);
    assert.equal(s.debt, 600);
    assert.equal(s.movements[0]?.type, "OPENING_BALANCE");
    assertRunning(s);
  });
});

describe("12. Employee ledger", () => {
  it("opening + salary − payment", () => {
    const s = computeEntryLedger({
      entityType: "employee",
      entityId: "e1",
      entityName: "עובד",
      openingBalance: 200,
      entries: [
        {
          id: "sal",
          debit: 300,
          credit: 0,
          entryDate: d("2026-09-01"),
          docType: "שכר",
          description: "Salary",
        },
        {
          id: "pay",
          debit: 0,
          credit: 100,
          entryDate: d("2026-09-05"),
          docType: "תשלום",
          description: "Paid",
        },
      ],
    });
    assert.equal(s.entityType, "employee");
    assert.equal(s.signedBalance, 400);
    assertRunning(s);
  });
});

describe("13. Same name / different IDs", () => {
  it("does not merge two customers named כרמל", () => {
    const a = computeCustomerLedger({
      entityId: "c-a",
      entityName: "כרמל",
      openingBalance: 0,
      documents: [invoice("i1", 100, "2026-09-01")],
      payments: [],
    });
    const b = computeCustomerLedger({
      entityId: "c-b",
      entityName: "כרמל",
      openingBalance: 0,
      documents: [invoice("i2", 30, "2026-09-01")],
      payments: [],
    });
    assert.equal(a.entityId, "c-a");
    assert.equal(b.entityId, "c-b");
    assert.equal(a.signedBalance, 100);
    assert.equal(b.signedBalance, 30);
    assert.notEqual(a.entityId, b.entityId);
  });
});

describe("14. Same person in multiple roles", () => {
  it("customer and supplier with the same name stay separate", () => {
    const customer = computeCustomerLedger({
      entityId: "c-1",
      entityName: "אלבאבי",
      openingBalance: 0,
      documents: [invoice("i1", 80, "2026-09-01")],
      payments: [],
    });
    const supplier = computeEntryLedger({
      entityType: "supplier",
      entityId: "s-1",
      entityName: "אלבאבי",
      openingBalance: 0,
      entries: [
        {
          id: "p1",
          debit: 50,
          credit: 0,
          entryDate: d("2026-09-01"),
          docType: "הוצאה",
          description: "Buy",
        },
      ],
    });
    assert.equal(customer.entityType, "customer");
    assert.equal(supplier.entityType, "supplier");
    assert.notEqual(customer.entityId, supplier.entityId);
    assert.equal(customer.signedBalance, 80);
    assert.equal(supplier.signedBalance, 50);
  });

  it("supplier invoice minus recorded payment is open debt, not a credit of the full invoice", () => {
    const supplier = computeEntryLedger({
      entityType: "supplier",
      entityId: "s-hani",
      entityName: "هاني كعك",
      openingBalance: 0,
      entries: [
        {
          id: "inv",
          debit: 10000,
          credit: 7000,
          entryDate: d("2026-09-01"),
          docType: "חשבונית מס",
          description: "supplier invoice",
        },
      ],
    });
    assert.equal(supplier.debt, 3000);
    assert.equal(supplier.credit, 0);
    assert.equal(supplier.signedBalance, 3000);
  });
});

describe("15. Negative balance", () => {
  it("keeps the sign", () => {
    const split = splitSignedBalance(-75);
    assert.equal(split.signedBalance, -75);
    assert.equal(split.debt, 0);
    assert.equal(split.credit, 75);
  });
});

describe("16. Zero balance", () => {
  it("is ZERO not clamped debt", () => {
    const split = splitSignedBalance(0);
    assert.equal(split.side, "ZERO");
    assert.equal(split.debt, 0);
    assert.equal(split.credit, 0);
  });
});

describe("17. Running balance after every movement", () => {
  it("is continuous across an overpayment", () => {
    const s = computeCustomerLedger({
      entityId: "c1",
      entityName: "A",
      openingBalance: 1000,
      documents: [],
      payments: [pay("a", 400, "2026-09-02"), pay("b", 700, "2026-09-10")],
    });
    assert.equal(s.movements[0]?.balance_after, 1000);
    assert.equal(s.movements[1]?.balance_before, 1000);
    assert.equal(s.movements[1]?.balance_after, 600);
    assert.equal(s.movements[2]?.balance_before, 600);
    assert.equal(s.movements[2]?.balance_after, -100);
    assertRunning(s);
  });
});

describe("policy", () => {
  it("does not treat OrderPayment as ledger input", () => {
    assert.equal(ORDER_PAYMENT_LEDGER_POLICY.included, false);
    assert.equal(ORDER_PAYMENT_LEDGER_POLICY.status, "UNPROVEN");
  });
});
