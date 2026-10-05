import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  documentArchivePartyKind,
  documentMatchesArchiveKind,
} from "./counterparty-filter";
import { isInvoiceDocumentType } from "./invoice-documents";
import type { FinanceDocumentRow } from "./types";

function row(partial: Partial<FinanceDocumentRow>): FinanceDocumentRow {
  return {
    id: "d1",
    title: "מסמך",
    category: "הכנסה",
    document_type: "חשבונית מס",
    customer_id: null,
    total_amount: 0,
    paid_amount: 0,
    remaining_amount: 0,
    payment_status: "unpaid",
    deposit_amount: 0,
    doc_date: null,
    notes: null,
    pdf_storage_path: null,
    sent_to_cpa: false,
    sent_to_cpa_at: null,
    sent_to_cpa_email: null,
    sent_to_cpa_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    payload: null,
    ...partial,
  };
}

describe("archive party filter", () => {
  it("filters by stored ids, not by the document title", () => {
    const customer = row({ customer_id: "c1", title: "ספק אחמד" });
    const supplier = row({ supplier_id: "s1", title: "עובד" });
    const employee = row({ employee_id: "e1", category: "הוצאה", title: "לקוח" });
    const none = row({ title: "עובדים ספקים לקוחות" });

    assert.equal(documentArchivePartyKind(customer), "customer");
    assert.equal(documentArchivePartyKind(supplier), "supplier");
    assert.equal(documentArchivePartyKind(employee), "employee");
    assert.equal(documentArchivePartyKind(none), null);

    assert.equal(documentMatchesArchiveKind(customer, ""), true);
    assert.equal(documentMatchesArchiveKind(customer, "customer"), true);
    assert.equal(documentMatchesArchiveKind(customer, "supplier"), false);
    assert.equal(documentMatchesArchiveKind(supplier, "supplier"), true);
    assert.equal(documentMatchesArchiveKind(employee, "employee"), true);
    assert.equal(documentMatchesArchiveKind(none, "employee"), false);
  });

  it("keeps a supplier link when a customer id is also present", () => {
    const both = row({ customer_id: "c1", supplier_id: "s1" });
    assert.equal(documentArchivePartyKind(both), "supplier");
    assert.equal(documentMatchesArchiveKind(both, "customer"), false);
  });
});

describe("invoice document types", () => {
  it("includes existing invoice labels and skips other document types", () => {
    assert.equal(isInvoiceDocumentType("חשבונית"), true);
    assert.equal(isInvoiceDocumentType("חשבונית מס"), true);
    assert.equal(isInvoiceDocumentType("חשבונית מס קבלה"), true);
    assert.equal(isInvoiceDocumentType("חשבונית מס / קבלה"), true);
    assert.equal(isInvoiceDocumentType("חשבונית זיכוי"), true);
    assert.equal(isInvoiceDocumentType("תעודת משלוח"), false);
    assert.equal(isInvoiceDocumentType("דוח Z"), false);
    assert.equal(isInvoiceDocumentType(""), false);
  });
});
