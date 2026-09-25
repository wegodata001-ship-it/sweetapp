import ExcelJS from "exceljs";
import { createPdf } from "@/lib/pdf/pdf-engine";
import { drawTable } from "@/lib/pdf/pdf-table";
import { PDF_COLORS } from "@/lib/pdf/pdf-theme";
import { formatMoney } from "@/lib/pdf/pdf-utils";
import { vatSummaryReconciles, type VatSourceLine, type VatSummary } from "@/lib/finance/vat-summary";
import { addMoney } from "@/lib/finance/manual-receipt-vat";

export type VatExportSections = {
  summary: boolean;
  z: boolean;
  income: boolean;
  input: boolean;
};

const ALL_SECTIONS: VatExportSections = { summary: true, z: true, income: true, input: true };
const MONEY_FORMAT = '[$-en-US]#,##0.00 "₪"';

export function financialSummaryFileStem(from: string, to: string): string {
  const [y, m, d] = from.split("-");
  const monthEnd = new Date(Date.UTC(Number(y), Number(m), 0)).toISOString().slice(0, 10);
  if (d === "01" && to === monthEnd) return `WEGO_סיכום_פיננסי_${y}-${m}`;
  if (from.endsWith("-01-01") && to.endsWith("-12-31") && from.slice(0, 4) === to.slice(0, 4)) {
    return `WEGO_סיכום_פיננסי_${from.slice(0, 4)}`;
  }
  return `WEGO_סיכום_פיננסי_${from}_${to}`;
}

function dmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function localStamp(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()} ${hh}:${mi}`;
}

function excelDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function amount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function shekel(value: string): string {
  return formatMoney(amount(value));
}

function sumField(rows: VatSourceLine[], field: keyof VatSourceLine): string {
  return rows.reduce((total, row) => addMoney(total, String(row[field] ?? "0")), "0.00");
}

function rowsOf(summary: VatSummary, type: VatSourceLine["sourceType"] | VatSourceLine["sourceType"][]): VatSourceLine[] {
  const types = Array.isArray(type) ? type : [type];
  return summary.sources.filter((row) => types.includes(row.sourceType));
}

/** Refuses to export when the detail rows do not add up to the summary the screen shows. */
export function assertVatExportMatchesUi(summary: VatSummary): void {
  if (!vatSummaryReconciles(summary).ok) {
    throw new Error("VAT_EXPORT_MISMATCH");
  }
}

type GridRow = { cells: string[]; total?: boolean };

async function drawGrid(
  layout: Parameters<typeof drawTable>[0],
  title: string,
  headers: string[],
  rows: GridRow[],
  widths: number[],
  wrap: number[] = [],
) {
  await layout.sectionTitle(title);
  await drawTable(layout, {
    columns: headers.map((header, index) => ({
      header,
      width: widths[index] ?? 1,
      align: index === 0 ? "start" as const : "end" as const,
      value: (row: GridRow) => row.cells[index] ?? "",
      color: (row: GridRow) => (row.total ? PDF_COLORS.brandDark : undefined),
      weight: (row: GridRow) => (row.total ? "bold" as const : "regular" as const),
      wrap: wrap.includes(index),
    })),
    rows,
    wrapHeaders: true,
    emptyText: "אין שורות בתקופה",
  });
  layout.gap();
}

export async function buildFinancialSummaryPdf(input: {
  summary: VatSummary;
  from: string;
  to: string;
  generatedAt?: Date;
  sections?: Partial<VatExportSections>;
}): Promise<Uint8Array> {
  assertVatExportMatchesUi(input.summary);
  const sections = { ...ALL_SECTIONS, ...input.sections };
  const summary = input.summary;
  const generated = input.generatedAt ?? new Date();
  const zRows = rowsOf(summary, "z_report");
  const incomeRows = rowsOf(summary, "income_document");
  const inputRows = rowsOf(summary, ["manual_receipt", "expense_invoice"]);

  const created = await createPdf({
    documentType: "financialReport",
    language: "he",
    title: "WEGO BUSINESS",
    subtitle: "סיכום פיננסי",
    footerText: "WEGO BUSINESS",
    headerMeta: [
      { label: "תקופה", value: `${dmy(input.from)} – ${dmy(input.to)}` },
      { label: "תאריך הפקת הדוח", value: localStamp(generated) },
    ],
    data: summary,
    render: async (ctx) => {
      const { layout } = ctx;
      if (sections.summary) {
        await layout.sectionTitle("סיכום מע״מ");
        await layout.infoPanel([
          { label: "מע״מ עסקאות", value: shekel(summary.outputVat) },
          { label: "מע״מ תשומות", value: shekel(summary.inputVat) },
          { label: "מע״מ משוער לתשלום", value: shekel(summary.payableVat) },
        ]);
        await layout.totals([
          { label: "דוחות Z", value: shekel(summary.outputBySource.zReports.vatAmount) },
          { label: "מסמכי הכנסה", value: shekel(summary.outputBySource.incomeDocuments.vatAmount) },
          { label: "סה״כ מע״מ עסקאות", value: shekel(summary.outputVat), strong: true },
        ]);
      }
      if (sections.z) {
        await drawGrid(
          layout,
          "דוחות Z שנכללו בחישוב",
          ["תאריך", "מספר Z", "מזומן חייב", "אשראי חייב", "סה״כ חייב במע״מ", "מע״מ שחושב"],
          [
            ...zRows.map((row) => ({
              cells: [dmy(row.date), row.documentNumber, shekel(row.cashTaxable), shekel(row.creditTaxable), shekel(row.grossAmount), shekel(row.vatAmount)],
            })),
            {
              total: true,
              cells: ["סה״כ", "", "", "", shekel(summary.outputBySource.zReports.taxableAmount), shekel(summary.outputBySource.zReports.vatAmount)],
            },
          ],
          [1.1, 1.1, 1.2, 1.2, 1.6, 1.3],
        );
      }
      if (sections.income) {
        await drawGrid(
          layout,
          "מסמכי הכנסה שנכללו בחישוב",
          ["תאריך", "מספר מסמך", "לקוח", "סוג מסמך", "סכום לפני מע״מ", "מע״מ", "סה״כ"],
          [
            ...incomeRows.map((row) => ({
              cells: [dmy(row.date), row.documentNumber, row.partyName || "—", row.documentType || "—", shekel(row.netAmount), shekel(row.vatAmount), shekel(row.grossAmount)],
            })),
            {
              total: true,
              cells: [
                "סה״כ",
                "",
                "",
                "",
                shekel(sumField(incomeRows, "netAmount")),
                shekel(summary.outputBySource.incomeDocuments.vatAmount),
                shekel(sumField(incomeRows, "grossAmount")),
              ],
            },
          ],
          [1, 1.3, 1.6, 1.2, 1.3, 1, 1.1],
          [2, 3],
        );
      }
      if (sections.input) {
        await drawGrid(
          layout,
          "מסמכי הוצאה / מע״מ תשומות",
          ["תאריך", "מספר מסמך", "ספק", "סוג", "לפני מע״מ", "מע״מ במסמך", "מע״מ מוכר", "סה״כ"],
          [
            ...inputRows.map((row) => ({
              cells: [dmy(row.date), row.documentNumber, row.partyName || "—", row.documentType || "—", shekel(row.netAmount), shekel(row.documentVat), shekel(row.vatAmount), shekel(row.grossAmount)],
            })),
            {
              total: true,
              cells: ["סה״כ", "", "", "", shekel(summary.deductibleExpenses), "", shekel(summary.inputVat), ""],
            },
          ],
          [1, 1.2, 1.4, 1, 1.1, 1.1, 1.1, 1],
          [2, 3],
        );
      }
    },
  });
  if (created.missingGlyphs.length > 0) {
    throw new Error("PDF_MISSING_GLYPHS");
  }
  return created.bytes;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF081224" } };
  row.alignment = { horizontal: "right" };
}

function moneyColumn(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = MONEY_FORMAT;
}

function dateColumn(cell: ExcelJS.Cell, iso: string) {
  cell.value = excelDate(iso);
  cell.numFmt = "[$-en-US]dd/mm/yyyy";
}

export async function buildFinancialSummaryWorkbook(input: {
  summary: VatSummary;
  from: string;
  to: string;
}): Promise<Uint8Array> {
  assertVatExportMatchesUi(input.summary);
  const summary = input.summary;
  const wb = new ExcelJS.Workbook();
  wb.creator = "WEGO BUSINESS";
  wb.views = [{ rightToLeft: true, activeTab: 0 }];

  const summarySheet = wb.addWorksheet("סיכום", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  summarySheet.columns = [{ width: 32 }, { width: 22 }];
  summarySheet.addRow(["WEGO BUSINESS"]);
  summarySheet.addRow(["סיכום פיננסי"]);
  summarySheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF081224" } };
  summarySheet.getRow(2).font = { bold: true, size: 14 };
  summarySheet.addRow(["תקופה", `${dmy(input.from)} - ${dmy(input.to)}`]);
  summarySheet.addRow([]);
  const writeMoney = (label: string, value: string) => {
    const row = summarySheet.addRow([label, amount(value)]);
    moneyColumn(row.getCell(2), amount(value));
    row.getCell(1).font = { bold: true };
  };
  writeMoney("מע״מ עסקאות", summary.outputVat);
  writeMoney("מע״מ תשומות", summary.inputVat);
  writeMoney("מע״מ משוער לתשלום", summary.payableVat);
  summarySheet.addRow(["פירוט"]).font = { bold: true };
  writeMoney("מע״מ מדוחות Z", summary.outputBySource.zReports.vatAmount);
  writeMoney("מע״מ ממסמכי הכנסה", summary.outputBySource.incomeDocuments.vatAmount);
  writeMoney("מע״מ תשומות", summary.inputVat);

  const zSheet = wb.addWorksheet("דוחות Z", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const zHeader = zSheet.addRow(["תאריך", "מספר Z", "מזומן חייב", "אשראי חייב", "סה״כ חייב במע״מ", "מע״מ"]);
  styleHeader(zHeader);
  for (const row of rowsOf(summary, "z_report")) {
    const line = zSheet.addRow(["", row.documentNumber]);
    dateColumn(line.getCell(1), row.date);
    moneyColumn(line.getCell(3), amount(row.cashTaxable));
    moneyColumn(line.getCell(4), amount(row.creditTaxable));
    moneyColumn(line.getCell(5), amount(row.grossAmount));
    moneyColumn(line.getCell(6), amount(row.vatAmount));
  }
  const zTotal = zSheet.addRow(["סה״כ", ""]);
  moneyColumn(zTotal.getCell(5), amount(summary.outputBySource.zReports.taxableAmount));
  moneyColumn(zTotal.getCell(6), amount(summary.outputBySource.zReports.vatAmount));
  zTotal.font = { bold: true };
  zSheet.columns.forEach((col) => { col.width = 22; });
  zSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, zSheet.rowCount - 1), column: 6 } };

  const incomeSheet = wb.addWorksheet("מסמכי הכנסה", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  styleHeader(incomeSheet.addRow(["תאריך", "מספר מסמך", "לקוח", "סוג מסמך", "לפני מע״מ", "מע״מ", "סה״כ"]));
  for (const row of rowsOf(summary, "income_document")) {
    const line = incomeSheet.addRow(["", row.documentNumber, row.partyName, row.documentType]);
    dateColumn(line.getCell(1), row.date);
    moneyColumn(line.getCell(5), amount(row.netAmount));
    moneyColumn(line.getCell(6), amount(row.vatAmount));
    moneyColumn(line.getCell(7), amount(row.grossAmount));
  }
  const incomeRows = rowsOf(summary, "income_document");
  const incomeTotal = incomeSheet.addRow(["סה״כ", "", "", ""]);
  moneyColumn(incomeTotal.getCell(5), amount(sumField(incomeRows, "netAmount")));
  moneyColumn(incomeTotal.getCell(6), amount(summary.outputBySource.incomeDocuments.vatAmount));
  moneyColumn(incomeTotal.getCell(7), amount(sumField(incomeRows, "grossAmount")));
  incomeTotal.font = { bold: true };
  incomeSheet.columns.forEach((col) => { col.width = 22; });
  incomeSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, incomeSheet.rowCount - 1), column: 7 } };

  const inputSheet = wb.addWorksheet("מע״מ תשומות", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  styleHeader(inputSheet.addRow(["תאריך", "מספר מסמך", "ספק", "סוג מסמך", "לפני מע״מ", "מע״מ", "מע״מ מוכר", "סה״כ"]));
  const inputRows = rowsOf(summary, ["manual_receipt", "expense_invoice"]);
  for (const row of inputRows) {
    const line = inputSheet.addRow(["", row.documentNumber, row.partyName, row.documentType]);
    dateColumn(line.getCell(1), row.date);
    moneyColumn(line.getCell(5), amount(row.netAmount));
    moneyColumn(line.getCell(6), amount(row.documentVat));
    moneyColumn(line.getCell(7), amount(row.vatAmount));
    moneyColumn(line.getCell(8), amount(row.grossAmount));
  }
  const inputTotal = inputSheet.addRow(["סה״כ", "", "", ""]);
  moneyColumn(inputTotal.getCell(5), amount(sumField(inputRows, "netAmount")));
  moneyColumn(inputTotal.getCell(6), amount(sumField(inputRows, "documentVat")));
  moneyColumn(inputTotal.getCell(7), amount(summary.inputVat));
  moneyColumn(inputTotal.getCell(8), amount(sumField(inputRows, "grossAmount")));
  inputTotal.font = { bold: true };
  inputSheet.columns.forEach((col) => { col.width = 20; });
  inputSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, inputSheet.rowCount - 1), column: 8 } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
