/**
 * Run: npx tsx --test src/lib/finance/ledger-forensic-audit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeLedgerForensicAudit,
  classifyNameDuplicates,
  runLedgerForensicAudit,
  sanitizeLedgerAuditError,
} from "./ledger-forensic-audit";

describe("authorizeLedgerForensicAudit", () => {
  it("Anonymous request → 401", () => {
    const r = authorizeLedgerForensicAudit(null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
  });

  it("ADMIN → 403", () => {
    const r = authorizeLedgerForensicAudit({ role: "ADMIN" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
  });

  it("EMPLOYEE → 403", () => {
    const r = authorizeLedgerForensicAudit({ role: "EMPLOYEE" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
  });

  it("SUPER_ADMIN → allowed", () => {
    const r = authorizeLedgerForensicAudit({ role: "SUPER_ADMIN" });
    assert.equal(r.ok, true);
  });
});

describe("OLD vs NEW customer engine", () => {
  it("overpayment: old clamp 0/0, new credit 100", () => {
    const report = runLedgerForensicAudit({
      customers: [{ id: "c1", name: "A", openingBalance: 0 }],
      suppliers: [],
      employees: [],
      documents: [
        {
          id: "d1",
          category: "הכנסה",
          documentType: "חשבונית מס",
          title: "inv",
          totalAmount: 1000,
          docDate: "2026-09-02",
          createdAt: "2026-09-02",
          customerId: "c1",
        },
      ],
      payments: [
        {
          id: "p1",
          customerId: "c1",
          amount: 1100,
          createdAt: "2026-09-10",
          documentId: "d1",
        },
      ],
      ledgerEntries: [],
    });
    assert.equal(report.coverage.customers, true);
    assert.equal(report.customers.total, 1);
    assert.equal(report.customers.fail, 1);
    const row = report.customers.rows[0]!;
    assert.equal(row.oldDebt, 0);
    assert.equal(row.oldCredit, 0);
    assert.equal(row.newDebt, 0);
    assert.equal(row.newCredit, 100);
    assert.equal(row.issues.some((i) => i.code === "CREDIT_CLAMP"), true);
  });

  it("opening debt 500 is ignored by old engine and used by new", () => {
    const report = runLedgerForensicAudit({
      customers: [{ id: "c1", name: "A", openingBalance: 500 }],
      suppliers: [],
      employees: [],
      documents: [
        {
          id: "d1",
          category: "הכנסה",
          documentType: "חשבונית מס",
          title: "inv",
          totalAmount: 1000,
          docDate: "2026-09-02",
          createdAt: "2026-09-02",
          customerId: "c1",
        },
      ],
      payments: [
        {
          id: "p1",
          customerId: "c1",
          amount: 400,
          createdAt: "2026-09-10",
          documentId: "d1",
        },
      ],
      ledgerEntries: [],
    });
    const row = report.customers.rows[0]!;
    assert.equal(row.oldDebt, 600);
    assert.equal(row.newDebt, 1100);
    assert.equal(row.issues.some((i) => i.code === "OPENING_BALANCE_IGNORED"), true);
  });

  it("credit note 200 reduces new debt to 800", () => {
    const report = runLedgerForensicAudit({
      customers: [{ id: "c1", name: "A", openingBalance: 0 }],
      suppliers: [],
      employees: [],
      documents: [
        {
          id: "inv",
          category: "הכנסה",
          documentType: "חשבונית מס",
          title: "inv",
          totalAmount: 1000,
          docDate: "2026-09-02",
          createdAt: "2026-09-02",
          customerId: "c1",
        },
        {
          id: "cn",
          category: "הכנסה",
          documentType: "חשבונית זיכוי",
          title: "cn",
          totalAmount: 200,
          docDate: "2026-09-05",
          createdAt: "2026-09-05",
          customerId: "c1",
        },
      ],
      payments: [],
      ledgerEntries: [],
    });
    const row = report.customers.rows[0]!;
    assert.equal(row.oldDebt, 1200);
    assert.equal(row.newDebt, 800);
    assert.equal(row.creditNotes, 200);
    assert.equal(row.issues.some((i) => i.code === "CREDIT_NOTE_DIRECTION"), true);
  });

  it("covers 100% customers including zero-activity", () => {
    const report = runLedgerForensicAudit({
      customers: [
        { id: "c1", name: "A", openingBalance: 0 },
        { id: "c2", name: "B", openingBalance: 0 },
      ],
      suppliers: [],
      employees: [],
      documents: [],
      payments: [],
      ledgerEntries: [],
    });
    assert.equal(report.customers.total, 2);
    assert.equal(report.coverage.customers, true);
  });
});

describe("supplier and employee semantics", () => {
  it("supplier overpay: old clamp 0, new credit 100", () => {
    const report = runLedgerForensicAudit({
      customers: [],
      suppliers: [{ id: "s1", name: "ספק", openingBalance: 1000 }],
      employees: [],
      documents: [],
      payments: [],
      ledgerEntries: [
        {
          id: "e1",
          supplierId: "s1",
          debit: 0,
          credit: 1100,
          entryDate: "2026-09-10",
          docType: "תשלום",
          description: "pay",
        },
      ],
    });
    assert.equal(report.coverage.suppliers, true);
    const row = report.suppliers.rows[0]!;
    assert.equal(row.oldDebt, 0);
    assert.equal(row.newCredit, 100);
    assert.equal(row.issues.some((i) => i.code === "CREDIT_CLAMP"), true);
  });

  it("employee uses entry formula, not customer documents", () => {
    const report = runLedgerForensicAudit({
      customers: [],
      suppliers: [],
      employees: [{ id: "e1", name: "עובד", openingBalance: 200 }],
      documents: [
        {
          id: "d1",
          category: "הכנסה",
          documentType: "חשבונית מס",
          title: "should not affect employee",
          totalAmount: 9999,
          docDate: "2026-09-01",
          createdAt: "2026-09-01",
          customerId: null,
        },
      ],
      payments: [],
      ledgerEntries: [
        {
          id: "w1",
          employeeId: "e1",
          debit: 300,
          credit: 0,
          entryDate: "2026-09-01",
          docType: "שכר",
          description: "שכר",
        },
        {
          id: "w2",
          employeeId: "e1",
          debit: 0,
          credit: 100,
          entryDate: "2026-09-15",
          docType: "תשלום",
          description: "תשלום",
        },
      ],
    });
    const row = report.employees.rows[0]!;
    assert.equal(row.newDebt, 400);
    assert.equal(row.expectedSignedBalance, 400);
    assert.equal(report.coverage.employees, true);
  });
});

describe("duplicate classification", () => {
  it("same name customer+supplier is LEGITIMATE_MULTI_ROLE", () => {
    const rows = classifyNameDuplicates({
      customers: [{ id: "c1", name: "אלבאבי", phone: "050111", openingBalance: 0 }],
      suppliers: [{ id: "s1", name: "אלבאבי", phone: "050222", openingBalance: 0 }],
      employees: [],
    });
    assert.equal(rows[0]?.classification, "LEGITIMATE_MULTI_ROLE");
  });

  it("same name + same phone same type is CONFIRMED_DUPLICATE", () => {
    const rows = classifyNameDuplicates({
      customers: [],
      suppliers: [],
      employees: [
        { id: "a", name: "Super Admin", phone: "0501234567", openingBalance: 0 },
        { id: "b", name: "Super Admin", phone: "050-123-4567", openingBalance: 0 },
      ],
    });
    assert.equal(rows[0]?.classification, "CONFIRMED_DUPLICATE");
  });

  it("same name same type different phone is POSSIBLE_DUPLICATE", () => {
    const rows = classifyNameDuplicates({
      customers: [
        { id: "a", name: "ابو ياسر", phone: "0501111111", openingBalance: 0 },
        { id: "b", name: "ابو ياسر ٢", phone: "0502222222", openingBalance: 0 },
      ],
      suppliers: [],
      employees: [],
    });
    assert.equal(rows.length, 0);
    const possible = classifyNameDuplicates({
      customers: [
        { id: "a", name: "ابو ياسر", phone: "0501111111", openingBalance: 0 },
        { id: "b", name: "ابو ياسر", phone: "0502222222", openingBalance: 0 },
      ],
      suppliers: [],
      employees: [],
    });
    assert.equal(possible[0]?.classification, "POSSIBLE_DUPLICATE");
  });
});

describe("known cases and Carmel gap", () => {
  it("extracts כרמל and reports 1530 vs 1529.38 without rounding it away", () => {
    const report = runLedgerForensicAudit({
      customers: [{ id: "carmel", name: "כרמל", openingBalance: 0 }],
      suppliers: [{ id: "hani", name: "هاني كعك", openingBalance: 0 }],
      employees: [{ id: "sa", name: "Super Admin", openingBalance: 0 }],
      documents: [
        {
          id: "d1",
          category: "הכנסה",
          documentType: "חשבונית מס",
          title: "inv",
          totalAmount: 1529.38,
          docDate: "2026-09-01",
          createdAt: "2026-09-01",
          customerId: "carmel",
        },
      ],
      payments: [
        {
          id: "p1",
          customerId: "carmel",
          amount: 1530,
          createdAt: "2026-09-02",
          documentId: "d1",
        },
      ],
      ledgerEntries: [],
    });
    assert.equal(report.knownCases.carmel[0]?.name, "כרמל");
    assert.equal(report.knownCases.haniKaak[0]?.name, "هاني كعك");
    assert.equal(report.knownCases.superAdmin[0]?.name, "Super Admin");
    assert.ok(Math.abs((report.carmelGap?.historicalGap ?? 0) - 0.62) < 1e-9);
    assert.equal(report.carmelGap?.gapStillPresent, true);
    assert.equal(report.carmelGap?.payments1530[0]?.amount, 1530);
    assert.equal(report.carmelGap?.documents1529_38[0]?.amount, 1529.38);
  });
});

describe("response safety", () => {
  it("strips connection strings from errors", () => {
    const clean = sanitizeLedgerAuditError(
      new Error("Invalid `prisma` at postgresql://user:pass@db.example:5432/x DATABASE_URL"),
    );
    assert.doesNotMatch(clean, /postgresql:/);
    assert.doesNotMatch(clean, /DATABASE_URL/);
    assert.match(clean, /\[redacted\]/);
  });
});
