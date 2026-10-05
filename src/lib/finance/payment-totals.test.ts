import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDocumentPaymentTotals } from "./payment-totals";
import { emptyIncomeExpensePayload } from "./document-payload";

describe("document payment totals", () => {
  it("uses DB payments when present", () => {
    const payload = emptyIncomeExpensePayload("income");
    payload.payments = [{ id: "p", instrument: "CASH", amount: "3", notes: "" }];
    const t = computeDocumentPaymentTotals({
      totalAmount: 20,
      documentType: "חשבונית מס",
      metadata: payload,
      paidFromDb: 10,
    });
    assert.deepEqual(t, { paid: 10, remaining: 10, paymentStatus: "partial" });
  });

  it("falls back to payload lines only when DB paid is 0", () => {
    const payload = emptyIncomeExpensePayload("income");
    payload.payments = [{ id: "p", instrument: "CASH", amount: "20", notes: "" }];
    const t = computeDocumentPaymentTotals({
      totalAmount: 20,
      documentType: "חשבונית מס",
      metadata: payload,
      paidFromDb: 0,
    });
    assert.deepEqual(t, { paid: 20, remaining: 0, paymentStatus: "paid" });
  });

  it("Z is fully paid from totalAmount", () => {
    const t = computeDocumentPaymentTotals({
      totalAmount: 88,
      documentType: "דוח Z",
      metadata: { kind: "zreport" },
      paidFromDb: 0,
    });
    assert.deepEqual(t, { paid: 88, remaining: 0, paymentStatus: "paid" });
  });
});
