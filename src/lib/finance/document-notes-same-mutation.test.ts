import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

describe("document notes same mutation", () => {
  it("POST /api/documents writes document notes and payment notes in one persist", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/documents/route.ts"), "utf8");
    assert.match(src, /persistIncomeExpenseDocument/);
    assert.match(src, /persistZDocumentCreate/);
    assert.equal(src.includes("syncFinancialDocumentPaymentTotals"), false);
    assert.equal(src.includes("replaceCashFlowForDocument"), false);
    const persist = readFileSync(path.join(process.cwd(), "src/lib/finance/persist-document-create.ts"), "utf8");
    assert.match(persist, /documentNotesForStorage\(input\.ie\.documentNotes\)/);
    assert.match(persist, /notes: p\.notes\.trim\(\) \|\| null/);
  });

  it("does not expose a second notes-only save endpoint on documents", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/documents/route.ts"), "utf8");
    assert.equal(src.includes("/notes"), false);
    assert.equal(src.includes("saveNote"), false);
  });

  it("document-linked payment save uses one persist helper", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/payments/route.ts"), "utf8");
    assert.match(src, /saveDocumentLinkedPayment/);
    assert.equal(src.includes("syncCashFlowForPayment"), false);
    assert.equal(src.includes("syncFinancialDocumentPaymentTotals"), false);
  });
});
