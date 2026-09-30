/**
 * Run: npx tsx --test src/lib/finance/expense-obligation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyIncomeExpensePayload } from "./document-payload";
import {
  appliedExpensePaid,
  applyExpenseObligationToEntries,
  expenseOpenRemaining,
} from "./expense-obligation";

function expensePayload(amount: string) {
  const payload = emptyIncomeExpensePayload("expense");
  payload.payments = [{ id: "p1", instrument: "CASH", amount, notes: "" }];
  return payload;
}

describe("expense obligation remaining", () => {
  it("does not treat a blank default payment line as open debt", () => {
    const payload = expensePayload("");
    assert.equal(appliedExpensePaid({ total: 10000, storedPaid: 0, payload }), 10000);
    assert.equal(expenseOpenRemaining({ total: 10000, storedPaid: 0, payload }), 0);
  });

  it("keeps remaining after a partial typed payment", () => {
    const payload = expensePayload("7000");
    assert.equal(expenseOpenRemaining({ total: 10000, storedPaid: 0, payload }), 3000);
  });

  it("excludes a fully typed payment", () => {
    const payload = expensePayload("10000");
    assert.equal(expenseOpenRemaining({ total: 10000, storedPaid: 0, payload }), 0);
  });

  it("includes an explicit unpaid amount of 0", () => {
    const payload = expensePayload("0");
    assert.equal(expenseOpenRemaining({ total: 10000, storedPaid: 0, payload }), 10000);
  });

  it("uses stored paid when payment rows were synced from Payment", () => {
    const payload = expensePayload("");
    assert.equal(expenseOpenRemaining({ total: 10000, storedPaid: 4000, payload }), 6000);
  });

  it("drops a blank-payment expense from supplier AP without inventing a payment", () => {
    const payload = expensePayload("");
    const adjusted = applyExpenseObligationToEntries(
      [
        {
          id: "le1",
          supplierId: "s1",
          financialDocumentId: "d1",
          debit: 10000,
          credit: 0,
        },
      ],
      [
        {
          id: "d1",
          category: "הוצאה",
          totalAmount: 10000,
          paidAmount: 0,
          metadata: payload,
        },
      ],
    );
    assert.equal(adjusted.length, 0);
  });

  it("leaves manual ledger rows without a document unchanged", () => {
    const [row] = applyExpenseObligationToEntries(
      [{ id: "manual", supplierId: "s1", debit: 500, credit: 0 }],
      [],
    );
    assert.equal(row?.debit, 500);
    assert.equal(row?.credit, 0);
  });
});
