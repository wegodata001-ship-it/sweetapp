import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVE_INITIAL_TAKE,
  archiveListWhereSql,
  financialDocumentListSelect,
  prismaDocToArchiveListRow,
} from "./archive-list-query";

describe("archive list query", () => {
  it("first page is 30 rows so the table paints before the full archive", () => {
    assert.equal(ARCHIVE_INITIAL_TAKE, 30);
  });

  it("list select excludes metadata JSON and payments", () => {
    assert.equal("metadata" in financialDocumentListSelect, false);
    assert.equal("payments" in financialDocumentListSelect, false);
    assert.equal(financialDocumentListSelect.title, true);
    assert.equal(financialDocumentListSelect.docDate, true);
    assert.equal(financialDocumentListSelect.sentToCpa, true);
    assert.equal(financialDocumentListSelect.depositAmount, true);
    assert.equal(financialDocumentListSelect.notes, true);
  });

  it("maps displayed fields without parsing a payload", () => {
    const row = prismaDocToArchiveListRow({
      id: "d1",
      title: "القاعه",
      category: "הוצאה",
      documentType: "חשבונית",
      customerId: null,
      supplierId: "s1",
      employeeId: null,
      totalAmount: 10000,
      paidAmount: 0,
      remainingAmount: 10000,
      paymentStatus: "unpaid",
      notes: "הערת מסמך",
      pdfStoragePath: null,
      sentToCpa: false,
      sentToCpaAt: null,
      sentToCpaEmail: null,
      docDate: new Date("2026-09-30T00:00:00.000Z"),
      createdAt: new Date("2026-10-04T21:25:52.275Z"),
      depositAmount: 0,
      depositType: null,
      depositNote: null,
      depositStatus: "open",
      customer: null,
      supplier: { name: "האני" },
      employee: null,
      sourceDocument: { id: "src1", fileName: "scan.pdf", fileType: "application/pdf", mimeType: "application/pdf" },
      sentToCpaBy: null,
    });
    assert.equal(row.payload, null);
    assert.equal(row.doc_date, "2026-09-30");
    assert.equal(row.created_at.startsWith("2026-10-04"), true);
    assert.equal(row.notes, "הערת מסמך");
    assert.equal(row.supplier_name, "האני");
    assert.equal(row.source_file?.linked, true);
    assert.equal(row.total_amount, 10000);
  });

  it("builds server filters in SQL so search is not limited to the loaded page", () => {
    const empty = archiveListWhereSql(new URLSearchParams());
    assert.equal(empty.strings.join(""), "");
    const filtered = archiveListWhereSql(new URLSearchParams("q=قاعه&kind=supplier&invoices=1"));
    const sql = filtered.strings.join("?");
    assert.match(sql, /ILIKE/);
    assert.match(sql, /supplierId/);
    assert.match(sql, /documentType/);
  });
});
