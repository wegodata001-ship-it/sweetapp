import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VAT_RATE } from "./document-payload";
import {
  computeManualReceiptVat,
  createsExpenseMovement,
  inputVatFromReceipts,
  subtractMoney,
  systemVatRate,
} from "./manual-receipt-vat";

describe("manual receipt VAT", () => {
  it("uses the system VAT rate", () => {
    assert.equal(systemVatRate(), VAT_RATE);
    assert.equal(VAT_RATE, 0.18);
  });

  it("splits a VAT-inclusive amount", () => {
    const row = computeManualReceiptVat({
      enteredAmount: "118.00",
      mode: "includes_vat",
      vatDeductible: true,
    });
    assert.ok(row);
    assert.equal(row.amountBeforeVat, "100.00");
    assert.equal(row.vatAmount, "18.00");
    assert.equal(row.totalAmount, "118.00");
    assert.equal(row.vatDeductibleAmount, "18.00");
    assert.equal(row.vatRate, "0.1800");
  });

  it("adds VAT to an amount entered before VAT", () => {
    const row = computeManualReceiptVat({
      enteredAmount: "100",
      mode: "before_vat",
      vatDeductible: true,
    });
    assert.ok(row);
    assert.equal(row.amountBeforeVat, "100.00");
    assert.equal(row.vatAmount, "18.00");
    assert.equal(row.totalAmount, "118.00");
  });

  it("keeps a no-VAT document at zero VAT", () => {
    const row = computeManualReceiptVat({
      enteredAmount: "100.00",
      mode: "no_vat",
      vatDeductible: true,
    });
    assert.ok(row);
    assert.equal(row.amountBeforeVat, "100.00");
    assert.equal(row.vatAmount, "0.00");
    assert.equal(row.totalAmount, "100.00");
    assert.equal(row.vatDeductibleAmount, "0.00");
  });

  it("stores a non-deductible document without input VAT", () => {
    const row = computeManualReceiptVat({
      enteredAmount: "118.00",
      mode: "includes_vat",
      vatDeductible: false,
    });
    assert.ok(row);
    assert.equal(row.vatAmount, "18.00");
    assert.equal(row.vatDeductibleAmount, "0.00");
  });

  it("does not create a second expense movement", () => {
    assert.equal(createsExpenseMovement(), false);
  });

  it("sums only deductible VAT and subtracts it from output VAT", () => {
    const input = inputVatFromReceipts([
      { vatDeductibleAmount: "18.00" },
      { vatDeductibleAmount: "0.00" },
      { vatDeductibleAmount: "2.00" },
    ]);
    assert.equal(input, "20.00");
    assert.equal(subtractMoney("4500.00", "1200.00"), "3300.00");
  });
});
