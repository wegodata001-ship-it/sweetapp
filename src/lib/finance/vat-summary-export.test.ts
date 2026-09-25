import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { describe, it } from "node:test";
import { VAT_RATE } from "./document-payload";
import { getVatSummary } from "./vat-summary";
import {
  buildFinancialSummaryPdf,
  buildFinancialSummaryWorkbook,
  financialSummaryFileStem,
} from "./vat-summary-export";

const schedule = [
  { effectiveFrom: "1970-01-01", rate: 0.17 },
  { effectiveFrom: "2025-01-01", rate: VAT_RATE },
];

const arabic = ["خالي مروان", "القاعة", "دعوة الصلح"];

function sample() {
  return getVatSummary({
    from: "2026-09-01",
    to: "2026-09-30",
    zReports: Array.from({ length: 8 }, (_, index) => ({
      id: `z${index}`,
      date: "2026-09-02",
      documentNumber: `Z-${index + 1}`,
      cashTaxable: 118,
      cashExempt: 0,
      creditTaxable: 236,
    })),
    incomeDocuments: Array.from({ length: 40 }, (_, index) => ({
      id: `inv${index}`,
      date: "2026-09-03",
      documentNumber: `INV-${index + 1}`,
      partyName: arabic[index % arabic.length],
      documentType: "חשבונית",
      lines: [{ quantity: "1", price: "118", vatMode: "includes_vat" as const }],
    })),
    manualReceipts: [
      {
        id: "r1",
        date: "2026-09-04",
        documentNumber: "R-1",
        partyName: "خالي مروان",
        documentType: "קבלה",
        amountBeforeVat: "100.00",
        vatDeductibleAmount: "18.00",
        documentVat: "18.00",
        grossAmount: "118.00",
      },
    ],
    schedule,
  });
}

describe("financial summary export", () => {
  it("names a calendar month and a custom range", () => {
    assert.equal(financialSummaryFileStem("2026-09-01", "2026-09-30"), "WEGO_סיכום_פיננסי_2026-09");
    assert.equal(
      financialSummaryFileStem("2026-09-01", "2026-09-15"),
      "WEGO_סיכום_פיננסי_2026-09-01_2026-09-15",
    );
  });

  it("builds a multi-page RTL PDF from the summary dataset", async () => {
    const summary = sample();
    const bytes = await buildFinancialSummaryPdf({ summary, from: "2026-09-01", to: "2026-09-30" });
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 2);
    const broken = { ...summary, outputVat: "0.00" };
    await assert.rejects(() => buildFinancialSummaryPdf({ summary: broken, from: "2026-09-01", to: "2026-09-30" }));
  });

  it("writes numeric shekel cells, RTL, freeze, filter and every row", async () => {
    const summary = sample();
    const bytes = await buildFinancialSummaryWorkbook({ summary, from: "2026-09-01", to: "2026-09-30" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    assert.deepEqual(wb.worksheets.map((sheet) => sheet.name), ["סיכום", "דוחות Z", "מסמכי הכנסה", "מע״מ תשומות"]);

    const summarySheet = wb.getWorksheet("סיכום");
    assert.ok(summarySheet);
    assert.equal(summarySheet.getCell("B5").value, Number(summary.outputVat));
    assert.equal(typeof summarySheet.getCell("B5").value, "number");
    assert.match(String(summarySheet.getCell("B5").numFmt), /₪/);

    const zSheet = wb.getWorksheet("דוחות Z");
    assert.ok(zSheet);
    assert.equal(zSheet.views[0]?.rightToLeft, true);
    assert.equal(zSheet.views[0]?.state, "frozen");
    assert.equal(zSheet.views[0]?.ySplit, 1);
    assert.ok(zSheet.autoFilter);
    assert.equal(typeof zSheet.getCell("F2").value, "number");
    assert.equal(zSheet.getCell("F2").value, Number(summary.sources.find((row) => row.sourceType === "z_report")?.vatAmount));
    const zLast = zSheet.getRow(zSheet.rowCount);
    assert.equal(zLast.getCell(1).value, "סה״כ");
    assert.equal(zLast.getCell(6).value, Number(summary.outputBySource.zReports.vatAmount));
    assert.equal(zSheet.rowCount, summary.sources.filter((row) => row.sourceType === "z_report").length + 2);

    const income = wb.getWorksheet("מסמכי הכנסה");
    assert.ok(income);
    assert.equal(income.getCell("C2").value, "خالي مروان");
    assert.equal(income.rowCount, 42);
    assert.equal(income.getRow(income.rowCount).getCell(6).value, Number(summary.outputBySource.incomeDocuments.vatAmount));
  });
});
