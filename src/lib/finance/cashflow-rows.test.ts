import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCashFlowRowsForDocument,
  comparableCashFlowRows,
  incrementalRowsForAddedPayment,
  type CashFlowDocumentInput,
} from "./cashflow-rows";
import { emptyIncomeExpensePayload } from "./document-payload";

function incomeDoc(partial: Partial<CashFlowDocumentInput> = {}): CashFlowDocumentInput {
  const payload = emptyIncomeExpensePayload("income");
  payload.documentNotes = "הערת מסמך";
  payload.depositAmount = "";
  return {
    id: "doc1",
    documentType: "חשבונית מס",
    title: "מסמך הכנסה",
    category: "הכנסה",
    totalAmount: 10000,
    notes: "הערת מסמך",
    metadata: payload,
    docDate: new Date("2026-09-30T00:00:00.000Z"),
    createdAt: new Date("2026-10-04T21:25:52.275Z"),
    customerId: "cust1",
    customerName: "לקוח בדיקה",
    payments: [],
    ...partial,
  };
}

describe("cashflow rows engine", () => {
  it("allocates two income payments on the document business date", () => {
    const rows = comparableCashFlowRows(
      buildCashFlowRowsForDocument(
        incomeDoc({
          payments: [
            { id: "p1", amount: 4000, paymentMethod: "CASH", notes: "הערת תשלום 1" },
            { id: "p2", amount: 6000, paymentMethod: "BANK", notes: "הערת תשלום 2" },
          ],
        }),
      ),
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => ({ type: r.entryType, amount: r.amount, paymentId: r.paymentId, date: r.entryDate })),
      [
        { type: "income", amount: 4000, paymentId: "p1", date: "2026-09-30" },
        { type: "income", amount: 6000, paymentId: "p2", date: "2026-09-30" },
      ],
    );
    assert.equal(rows[0]?.notes, "הערת תשלום 1");
  });

  it("splits product vs deposit with the same remaining walk", () => {
    const payload = emptyIncomeExpensePayload("income");
    payload.includeDeposit = true;
    payload.depositAmount = "2000";
    payload.depositNote = "מגשים";
    const rows = comparableCashFlowRows(
      buildCashFlowRowsForDocument(
        incomeDoc({
          totalAmount: 10000,
          metadata: payload,
          payments: [{ id: "p1", amount: 10000, paymentMethod: "CASH", notes: "מלא" }],
        }),
      ),
    );
    assert.deepEqual(
      rows.map((r) => ({ type: r.entryType, amount: r.amount })),
      [
        { type: "deposit", amount: 2000 },
        { type: "income", amount: 8000 },
      ],
    );
  });

  it("adding a later payment incrementally matches a full rebuild", () => {
    const before = incomeDoc({
      payments: [{ id: "p1", amount: 4000, paymentMethod: "CASH", notes: "ראשון" }],
    });
    const added = { id: "p2", amount: 6000, paymentMethod: "BANK", notes: "שני" };
    const { rebuildAll, incrementalOnly, firstPayment } = incrementalRowsForAddedPayment(before, added);
    const rebuiltAfter = comparableCashFlowRows(
      buildCashFlowRowsForDocument({ ...before, payments: [...before.payments, added] }),
    );
    assert.equal(firstPayment, false);
    assert.deepEqual(rebuildAll, rebuiltAfter);
    const beforeRows = comparableCashFlowRows(buildCashFlowRowsForDocument(before));
    const combined = comparableCashFlowRows(
      [...beforeRows, ...incrementalOnly].map((r) => ({
        entryType: r.entryType,
        amount: r.amount,
        description: r.description,
        paymentMethod: r.paymentMethod,
        customerId: r.customerId,
        customerName: r.customerName,
        notes: r.notes,
        paymentId: r.paymentId,
        documentId: r.documentId,
        relatedDocumentId: r.relatedDocumentId,
        entryDate: new Date(`${r.entryDate}T00:00:00.000Z`),
        isDirect: r.isDirect,
        expenseType: r.expenseType,
      })),
    );
    assert.deepEqual(combined, rebuildAll);
  });

  it("first payment cannot incrementally keep metadata cashflow — replace is required", () => {
    const payload = emptyIncomeExpensePayload("income");
    payload.payments = [{ id: "meta", instrument: "CASH", amount: "10000", notes: "מטא" }];
    const before = incomeDoc({ metadata: payload, payments: [] });
    const added = { id: "p1", amount: 10000, paymentMethod: "CASH", notes: "ראשון" };
    const { firstPayment, rebuildAll } = incrementalRowsForAddedPayment(before, added);
    const metadataRows = comparableCashFlowRows(buildCashFlowRowsForDocument(before));
    assert.equal(firstPayment, true);
    assert.ok(metadataRows.length > 0);
    assert.equal(metadataRows[0]?.paymentId, null);
    assert.equal(rebuildAll[0]?.paymentId, "p1");
    assert.notDeepEqual(metadataRows, rebuildAll);
  });
});
