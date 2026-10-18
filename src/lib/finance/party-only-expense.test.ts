import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildItemsFromIncomeExpense,
  emptyIncomeExpensePayload,
  incomeExpenseTotalToPay,
  normalizePartyOnlyExpensePayload,
  paymentLinesTotal,
} from "./document-payload";
import { computeDocumentPaymentTotals } from "./payment-totals";
import { buildCashFlowRowsForDocument, comparableCashFlowRows } from "./cashflow-rows";

function dailyPaymentOnly(amount: string) {
  const ie = emptyIncomeExpensePayload("expense");
  ie.expenseType = "DAILY_PAYMENTS";
  ie.counterpartyName = "طرف يومي";
  ie.docDate = "2026-10-18";
  ie.documentType = "חשבונית מס";
  ie.payments = [{ id: "pay-d", instrument: "CASH", amount, notes: "يومي" }];
  ie.lines = [{ id: "line-d", itemName: "", quantity: "1", price: "", vatMode: "includes_vat", lineNote: "" }];
  return ie;
}

describe("party-only daily expense normalize", () => {
  it("copies the typed payment onto a single line so paid is not greater than total", () => {
    const raw = dailyPaymentOnly("12.5");
    assert.equal(incomeExpenseTotalToPay(raw), 0);
    assert.equal(paymentLinesTotal(raw), 12.5);
    const prepared = normalizePartyOnlyExpensePayload(raw);
    assert.equal(incomeExpenseTotalToPay(prepared), 12.5);
    assert.equal(paymentLinesTotal(prepared), 12.5);
    const items = buildItemsFromIncomeExpense(prepared);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.total, 12.5);
    const totals = computeDocumentPaymentTotals({
      totalAmount: 12.5,
      documentType: prepared.documentType,
      metadata: prepared,
      paidFromDb: 0,
    });
    assert.deepEqual(totals, { paid: 12.5, remaining: 0, paymentStatus: "paid" });
  });

  it("leaves an already-priced line unchanged", () => {
    const ie = dailyPaymentOnly("10");
    ie.lines = [{ id: "line-d", itemName: "سطر", quantity: "1", price: "10", vatMode: "includes_vat", lineNote: "" }];
    const prepared = normalizePartyOnlyExpensePayload(ie);
    assert.equal(prepared.lines[0]?.price, "10");
    assert.equal(prepared.lines[0]?.itemName, "سطر");
  });

  it("does not invent a line when nothing was paid", () => {
    const ie = dailyPaymentOnly("");
    const prepared = normalizePartyOnlyExpensePayload(ie);
    assert.equal(prepared.lines[0]?.price, "");
    assert.equal(incomeExpenseTotalToPay(prepared), 0);
  });

  it("does not rewrite supplier or worker expenses", () => {
    const supplier = emptyIncomeExpensePayload("expense");
    supplier.expenseType = "SUPPLIER_PAYMENTS";
    supplier.payments = [{ id: "p", instrument: "CASH", amount: "8", notes: "" }];
    assert.equal(normalizePartyOnlyExpensePayload(supplier), supplier);

    const worker = emptyIncomeExpensePayload("expense");
    worker.expenseType = "WORKER_PAYMENTS";
    worker.employeePayAmount = "9";
    worker.payments = [{ id: "p", instrument: "CASH", amount: "9", notes: "" }];
    assert.equal(normalizePartyOnlyExpensePayload(worker), worker);
  });

  it("stamps cashflow expenseType DAILY_PAYMENTS with remaining 0", () => {
    const prepared = normalizePartyOnlyExpensePayload(dailyPaymentOnly("12.5"));
    const rows = comparableCashFlowRows(
      buildCashFlowRowsForDocument({
        id: "doc-daily",
        documentType: prepared.documentType,
        title: "مدفوعات يومية",
        category: "הוצאה",
        totalAmount: 12.5,
        notes: null,
        metadata: prepared,
        docDate: new Date("2026-10-18T00:00:00.000Z"),
        createdAt: new Date("2026-10-18T12:00:00.000Z"),
        customerId: null,
        customerName: "طرف يومي",
        payments: [],
      }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.entryType, "expense");
    assert.equal(rows[0]?.amount, 12.5);
    assert.equal(rows[0]?.expenseType, "DAILY_PAYMENTS");
    assert.equal(rows[0]?.entryDate, "2026-10-18");
  });

  it("forces quantity 1 so a leftover qty cannot inflate the synthesized total", () => {
    const ie = dailyPaymentOnly("20");
    ie.lines = [{ id: "line-d", itemName: "وصف", quantity: "2", price: "", vatMode: "includes_vat", lineNote: "" }];
    const prepared = normalizePartyOnlyExpensePayload(ie);
    assert.equal(prepared.lines[0]?.quantity, "1");
    assert.equal(prepared.lines[0]?.itemName, "وصف");
    assert.equal(incomeExpenseTotalToPay(prepared), 20);
  });
});
