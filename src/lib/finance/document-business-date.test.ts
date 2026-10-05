/**
 * Run: npx tsx --test src/lib/finance/document-business-date.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  businessDayKey,
  cashflowDateForRegisterIncome,
  dashboardPeriodDate,
  DOCUMENT_NOTES_MAX,
  documentNotesForStorage,
  isAutoPaymentSummaryNotes,
  parseBusinessDocDate,
  resolveDocumentNotes,
  resolveWrittenDocDate,
} from "@/lib/finance/document-business-date";
import { emptyIncomeExpensePayload, parsePayload } from "@/lib/finance/document-payload";

describe("business document date", () => {
  it("keeps 2026-09-30 as September 30, not 29 or 01", () => {
    const d = parseBusinessDocDate("2026-09-30");
    assert.ok(d);
    assert.equal(businessDayKey(d), "2026-09-30");
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 8);
    assert.equal(d.getUTCDate(), 30);
  });

  it("Test A: created in October, document date 30/09 stays September", () => {
    const docDate = parseBusinessDocDate("2026-09-30")!;
    const created = new Date("2026-10-05T08:00:00.000Z");
    assert.equal(businessDayKey(cashflowDateForRegisterIncome(docDate, created)), "2026-09-30");
    assert.equal(
      businessDayKey(dashboardPeriodDate({ entryType: "income", entryDate: created, documentDocDate: docDate })),
      "2026-09-30",
    );
  });

  it("Test B: same-day document date stays October", () => {
    assert.equal(businessDayKey(resolveWrittenDocDate("2026-10-05")!), "2026-10-05");
  });

  it("Test C: 01/01/2027 stays January 2027", () => {
    assert.equal(businessDayKey(resolveWrittenDocDate("2027-01-01")!), "2027-01-01");
  });

  it("Test D: editing 30/09 → 01/10 moves the period date once", () => {
    const created = new Date("2026-10-05T08:00:00.000Z");
    const first = dashboardPeriodDate({
      entryType: "income",
      entryDate: created,
      documentDocDate: parseBusinessDocDate("2026-09-30"),
    });
    const second = dashboardPeriodDate({
      entryType: "income",
      entryDate: created,
      documentDocDate: parseBusinessDocDate("2026-10-01"),
    });
    assert.equal(businessDayKey(first), "2026-09-30");
    assert.equal(businessDayKey(second), "2026-10-01");
  });

  it("later cash without documentDate keeps payment createdAt", () => {
    const created = new Date("2026-10-05T08:00:00.000Z");
    assert.equal(
      businessDayKey(dashboardPeriodDate({ entryType: "income", entryDate: created, documentDocDate: null })),
      "2026-10-05",
    );
  });

  it("reuses FinancialDocument.notes and ignores auto payment summaries", () => {
    assert.equal(isAutoPaymentSummaryNotes("תשלום CASH: 10000"), true);
    assert.equal(resolveDocumentNotes("", "תשלום CASH: 10000"), "");
    assert.equal(resolveDocumentNotes("", "מגשים יוחזרו בערב"), "מגשים יוחזרו בערב");
    assert.equal(resolveDocumentNotes("  הערה  ", "תשלום CASH: 10000"), "הערה");
    assert.equal(documentNotesForStorage("  "), null);
  });

  it("keeps document notes separate from payment notes", () => {
    assert.equal(documentNotesForStorage("מבחן הערה למסמך"), "מבחן הערה למסמך");
    assert.equal(resolveDocumentNotes("מבחן הערה למסמך", "תשלום CASH: 10000"), "מבחן הערה למסמך");
    assert.notEqual(documentNotesForStorage("מבחן הערה למסמך"), "מבחן הערת תשלום");
    assert.equal(documentNotesForStorage(""), null);
    assert.equal(documentNotesForStorage("a".repeat(DOCUMENT_NOTES_MAX + 20))?.length, DOCUMENT_NOTES_MAX);
  });

  it("payload keeps document notes and payment notes on separate fields", () => {
    const raw = {
      ...emptyIncomeExpensePayload("income"),
      documentNotes: "מבחן הערה למסמך",
      payments: [{ id: "p1", instrument: "CASH", amount: "10000", notes: "מבחן הערת תשלום" }],
    };
    const parsed = parsePayload(raw);
    assert.ok(parsed && parsed.kind !== "zreport");
    assert.equal(parsed.documentNotes, "מבחן הערה למסמך");
    assert.equal(parsed.payments[0]?.notes, "מבחן הערת תשלום");
    assert.equal(documentNotesForStorage(parsed.documentNotes), "מבחן הערה למסמך");
  });
});
