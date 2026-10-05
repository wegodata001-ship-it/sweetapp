import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import {
  buildCashFlowRowsForDocument,
  buildZCashFlowRows,
  comparableCashFlowRows,
} from "./cashflow-rows";
import { computeDocumentPaymentTotals } from "./payment-totals";
import { documentNotesForStorage } from "./document-business-date";
import { emptyIncomeExpensePayload, type ZReportPayload } from "./document-payload";

describe("persist document create engine", () => {
  it("uses one write SQL for income/expense and one for Z", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/finance/persist-document-create.ts"), "utf8");
    assert.match(src, /prisma\.\$queryRaw/);
    assert.match(src, /prisma\.\$executeRaw/);
    assert.match(src, /documentNotesForStorage/);
    assert.equal((src.match(/\$queryRaw/g) ?? []).length, 1);
    assert.equal((src.match(/\$executeRaw/g) ?? []).length, 1);
  });

  it("income paid/remaining/notes match the old totals engine", () => {
    const ie = emptyIncomeExpensePayload("income");
    ie.documentNotes = "  הערת מסמך  ";
    ie.payments = [{ id: "p1", instrument: "CASH", amount: "10", notes: "הערת תשלום" }];
    const totals = computeDocumentPaymentTotals({
      totalAmount: 10,
      documentType: "חשבונית מס",
      metadata: ie,
      paidFromDb: 10,
    });
    assert.deepEqual(totals, { paid: 10, remaining: 0, paymentStatus: "paid" });
    assert.equal(documentNotesForStorage(ie.documentNotes), "הערת מסמך");
  });

  it("income cashflow rows include payment notes and document date", () => {
    const ie = emptyIncomeExpensePayload("income");
    ie.documentNotes = "הערת מסמך";
    const rows = comparableCashFlowRows(
      buildCashFlowRowsForDocument({
        id: "doc1",
        documentType: "חשבונית מס",
        title: "הכנסה",
        category: "הכנסה",
        totalAmount: 10,
        notes: "הערת מסמך",
        metadata: ie,
        docDate: new Date("2026-09-30T00:00:00.000Z"),
        createdAt: new Date("2026-10-05T00:00:00.000Z"),
        customerId: "c1",
        customerName: "לקוח",
        payments: [{ id: "pay1", amount: 10, paymentMethod: "CASH", notes: "הערת תשלום" }],
      }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.amount, 10);
    assert.equal(rows[0]?.notes, "הערת תשלום");
    assert.equal(rows[0]?.entryDate, "2026-09-30");
    assert.equal(rows[0]?.paymentId, "pay1");
  });

  it("Z cashflow splits cash/credit/transfer the same as the old sync", () => {
    const z: ZReportPayload = {
      kind: "zreport",
      zDate: "2026-10-05",
      zNumber: "1",
      cashTaxable: 8,
      cashExempt: 2,
      creditTaxable: 3,
      creditExempt: 1,
      transfers: 5,
    };
    const rows = buildZCashFlowRows({
      documentId: "z1",
      title: "דוח Z",
      totalAmount: 19,
      docDate: new Date("2026-10-05T00:00:00.000Z"),
      createdAt: new Date("2026-10-05T12:00:00.000Z"),
      z,
    });
    assert.deepEqual(
      rows.map((r) => ({ amount: r.amount, method: r.paymentMethod, source: r.source })),
      [
        { amount: 10, method: "CASH", source: "z_report" },
        { amount: 4, method: "CREDIT", source: "z_report" },
        { amount: 5, method: "BANK", source: "z_report" },
      ],
    );
  });
});
