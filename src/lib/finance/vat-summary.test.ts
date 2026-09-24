import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VAT_RATE } from "./document-payload";
import { getVatSummary, periodBounds, shiftAnchor, vatSummaryReconciles } from "./vat-summary";
import { cloneIncomePayloadForNewDocument, emptyIncomeExpensePayload } from "./document-payload";
import { vatRateOn } from "./vat-rate";

const schedule = [
  { effectiveFrom: "1970-01-01", rate: 0.17 },
  { effectiveFrom: "2025-01-01", rate: VAT_RATE },
];

describe("vat summary", () => {
  it("extracts VAT from taxable Z cash and credit only", () => {
    const summary = getVatSummary({
      from: "2026-09-01",
      to: "2026-09-30",
      zReports: [
        {
          id: "z1",
          date: "2026-09-02",
          cashTaxable: 11800,
          cashExempt: 300,
          creditTaxable: 5900,
        },
      ],
      incomeDocuments: [],
      manualReceipts: [],
      schedule,
    });
    assert.equal(summary.outputBySource.zReports.taxableAmount, "17700.00");
    assert.equal(summary.outputBySource.zReports.vatAmount, "2700.00");
    assert.equal(summary.sources[0]?.netAmount, "15000.00");
    assert.equal(summary.sources[0]?.cashExempt, "300.00");
    assert.equal(vatSummaryReconciles(summary).ok, true);
    assert.equal(summary.sources.some((row) => row.taxableAmount === "300.00"), false);
  });

  it("includes a taxable income document and skips an exempt one", () => {
    const summary = getVatSummary({
      from: "2026-09-01",
      to: "2026-09-30",
      zReports: [],
      incomeDocuments: [
        {
          id: "inv1",
          date: "2026-09-03",
          lines: [{ quantity: "1", price: "118", vatMode: "includes_vat" }],
        },
        {
          id: "inv2",
          date: "2026-09-03",
          lines: [{ quantity: "1", price: "100", vatMode: "exempt" }],
        },
      ],
      manualReceipts: [],
      schedule,
    });
    assert.equal(summary.outputBySource.incomeDocuments.vatAmount, "18.00");
    assert.equal(summary.sources.length, 1);
  });

  it("deducts only deductible manual-receipt VAT", () => {
    const summary = getVatSummary({
      from: "2026-09-01",
      to: "2026-09-30",
      zReports: [],
      incomeDocuments: [],
      manualReceipts: [
        { id: "r1", date: "2026-09-04", amountBeforeVat: "100.00", vatDeductibleAmount: "18.00" },
        { id: "r2", date: "2026-09-04", amountBeforeVat: "50.00", vatDeductibleAmount: "0.00" },
      ],
      schedule,
    });
    assert.equal(summary.inputVat, "18.00");
    assert.equal(summary.payableSide, "credit");
    assert.equal(summary.payableVat, "18.00");
  });

  it("does not count the same source twice", () => {
    const z = { id: "z1", date: "2026-09-02", cashTaxable: 118, cashExempt: 0, creditTaxable: 0 };
    const summary = getVatSummary({
      from: "2026-09-01",
      to: "2026-09-30",
      zReports: [z, z],
      incomeDocuments: [],
      manualReceipts: [],
      schedule,
    });
    assert.equal(summary.sources.length, 1);
    assert.equal(summary.outputVat, "18.00");
    assert.equal(vatSummaryReconciles(summary).ok, true);
  });

  it("keeps an old document on the historical rate", () => {
    assert.equal(vatRateOn("2024-06-01", schedule), 0.17);
    assert.equal(vatRateOn("2026-06-01", schedule), VAT_RATE);
    const oldDoc = getVatSummary({
      from: "2024-06-01",
      to: "2024-06-30",
      zReports: [{ id: "old", date: "2024-06-02", cashTaxable: 117, cashExempt: 0, creditTaxable: 0 }],
      incomeDocuments: [],
      manualReceipts: [],
      schedule,
    });
    assert.equal(oldDoc.outputVat, "17.00");
  });

  it("uses one range function for week, month, and year", () => {
    assert.deepEqual(periodBounds("week", "2026-09-23"), { from: "2026-09-20", to: "2026-09-26" });
    assert.deepEqual(periodBounds("month", "2026-09-23"), { from: "2026-09-01", to: "2026-09-30" });
    assert.deepEqual(periodBounds("year", "2026-09-23"), { from: "2026-01-01", to: "2026-12-31" });
    const week = getVatSummary({
      from: periodBounds("week", "2026-09-23").from,
      to: periodBounds("week", "2026-09-23").to,
      zReports: [{ id: "z", date: "2026-09-23", cashTaxable: 118, cashExempt: 0, creditTaxable: 0 }],
      incomeDocuments: [],
      manualReceipts: [],
      schedule,
    });
    const outside = getVatSummary({
      from: "2026-09-01",
      to: "2026-09-19",
      zReports: [{ id: "z", date: "2026-09-23", cashTaxable: 118, cashExempt: 0, creditTaxable: 0 }],
      incomeDocuments: [],
      manualReceipts: [],
      schedule,
    });
    assert.equal(week.outputVat, "18.00");
    assert.equal(outside.outputVat, "0.00");
    assert.equal(shiftAnchor("month", "2026-09-23", -1), "2026-08-23");
  });

  it("opens a new income draft without the original identity or payment", () => {
    const source = emptyIncomeExpensePayload("income");
    source.counterpartyName = "אחמד";
    source.documentType = "חשבונית מס";
    source.paymentPaidAmount = "118";
    source.payments = [{ id: "pay-old", instrument: "CASH", amount: "118", notes: "ref-1" }];
    source.receiptStoragePath = "private/original.pdf";
    source.lines = [{ id: "line-old", itemName: "מגש", quantity: "2", price: "50", vatMode: "includes_vat", lineNote: "הערה" }];
    const copy = cloneIncomePayloadForNewDocument(source, "2026-09-25");
    assert.equal(copy.counterpartyName, "אחמד");
    assert.equal(copy.documentType, "חשבונית מס");
    assert.equal(copy.lines[0]?.itemName, "מגש");
    assert.equal(copy.lines[0]?.quantity, "2");
    assert.equal(copy.lines[0]?.price, "50");
    assert.equal(copy.lines[0]?.vatMode, "includes_vat");
    assert.notEqual(copy.lines[0]?.id, "line-old");
    assert.equal(copy.paymentPaidAmount, "");
    assert.equal(copy.payments[0]?.amount, "");
    assert.equal(copy.receiptStoragePath, undefined);
    assert.equal(copy.docDate, "2026-09-25");
  });
});
