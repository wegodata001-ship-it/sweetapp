import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createsExpenseMovement } from "./manual-receipt-vat";
import {
  decodeManualReceiptDetails,
  manualReceiptLineAmount,
  parseManualReceiptLines,
  quoteManualReceipt,
  sumManualReceiptLines,
} from "./manual-receipt-lines";

const example = [
  { description: "חומרי גלם", quantity: "2", unitPrice: "100" },
  { description: "מוצר", quantity: "1", unitPrice: "300" },
];

describe("manual receipt lines", () => {
  it("multiplies quantity by unit price and keeps zero", () => {
    assert.equal(manualReceiptLineAmount("3", "50"), "150.00");
    assert.equal(manualReceiptLineAmount("0", "50"), "0.00");
    assert.equal(manualReceiptLineAmount("2", "0"), "0.00");
    assert.equal(manualReceiptLineAmount("-1", "10"), null);
    assert.equal(manualReceiptLineAmount("x", "10"), null);
  });

  it("sums the paper example to 500 and runs the existing VAT engine", () => {
    const parsed = parseManualReceiptLines(example);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(sumManualReceiptLines(parsed.lines), "500.00");

    const included = quoteManualReceipt({ lines: parsed.lines, mode: "includes_vat", vatDeductible: true });
    const before = quoteManualReceipt({ lines: parsed.lines, mode: "before_vat", vatDeductible: true });
    const none = quoteManualReceipt({ lines: parsed.lines, mode: "no_vat", vatDeductible: true });
    assert.ok(included && before && none);
    assert.equal(included.totalAmount, "500.00");
    assert.equal(before.amountBeforeVat, "500.00");
    assert.equal(before.totalAmount, "590.00");
    assert.equal(before.vatAmount, "90.00");
    assert.equal(none.vatAmount, "0.00");
    assert.equal(none.totalAmount, "500.00");
    assert.equal(createsExpenseMovement(), false);
  });

  it("rejects a completely empty invoice and ignores a blank extra row", () => {
    const empty = parseManualReceiptLines([{ description: "", quantity: "", unitPrice: "" }]);
    assert.equal("error" in empty, true);
    const kept = parseManualReceiptLines([
      ...example,
      { description: " ", quantity: "", unitPrice: "" },
    ]);
    assert.ok(!("error" in kept));
  });

  it("round-trips lines without treating them as the note", () => {
    const parsed = parseManualReceiptLines(example);
    if ("error" in parsed) return;
    const encoded = JSON.parse(
      JSON.stringify({
        v: 1,
        marker: "wego-manual-v1",
        note: "הערה",
        phone: "050",
        address: "",
        lines: parsed.lines,
      }),
    );
    const decoded = decodeManualReceiptDetails(JSON.stringify(encoded));
    assert.equal(decoded.note, "הערה");
    assert.equal(decoded.lines.length, 2);
    assert.equal(decodeManualReceiptDetails("טקסט ישן").note, "טקסט ישן");
    assert.equal(decodeManualReceiptDetails("טקסט ישן").lines.length, 0);
  });
});
