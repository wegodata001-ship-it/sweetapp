import { PDFDocument } from "pdf-lib";
import { embedInvoicePdfFonts } from "@/lib/pdf/font-cache";
import { ltrIsolate } from "@/lib/pdf/pdf-utils";
import {
  PDF_PAGE_W,
  PDF_PAGE_H,
  PDF_MARGIN,
  CONTENT_W,
  drawHeader,
  drawDataTable,
  drawSummaryLines,
  drawFooter,
  type ItemColumn,
} from "@/lib/pdf/invoice-pdf-draw";
import {
  RECON_COUNTRY_LABELS_HE,
  RECON_STATUS_LABELS_HE,
  type ReconCountry,
} from "@/lib/controls/reconciliation-constants";
import type { ReconImportDetailDto } from "@/lib/controls/reconciliation-types";

const ROWS_PER_PAGE = 13;

function fmtAmount(n: number | null): string {
  if (n === null || n === undefined) return "—";
  // Isolated so a negative difference keeps its minus sign on the left in a Hebrew row.
  return ltrIsolate(
    `${n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`,
  );
}

function fmtDate(iso: string): string {
  return ltrIsolate(new Date(iso).toLocaleDateString("he-IL"));
}

const COLUMNS: ItemColumn[] = [
  { key: "customerCode", width: 75, header: "קוד לקוח" },
  { key: "customerName", width: 140, header: "שם לקוח" },
  { key: "turkeyOrder", width: 80, header: "הזמנה חיצונית" },
  { key: "wegoOrder", width: 80, header: "הזמנה WEGO" },
  { key: "turkeyAmount", width: 88, header: "סכום חיצוני", numeric: true },
  { key: "wegoAmount", width: 88, header: "סכום WEGO", numeric: true },
  { key: "difference", width: 75, header: "פער", numeric: true },
  { key: "status", width: 95, header: "סטטוס" },
];

export async function generateReconciliationPdf(detail: ReconImportDetailDto): Promise<Uint8Array> {
  const pdfDoc = await pdfDocCreate();
  const fonts = await embedInvoicePdfFonts(pdfDoc);

  const countryLabel =
    RECON_COUNTRY_LABELS_HE[detail.import.country as ReconCountry] ?? detail.import.country;

  const chunks: typeof detail.rows[] = [];
  for (let i = 0; i < detail.rows.length; i += ROWS_PER_PAGE) {
    chunks.push(detail.rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
    const chunk = chunks[pageIdx];
    const page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    let y = await drawHeader(page, fonts, {
      reportTitleHe: "התאמת מערכות",
      metaFields: [
        { label: "מדינה", value: countryLabel },
        { label: "שבוע עבודה", value: detail.import.weekCode },
        { label: "קובץ", value: detail.import.fileName },
        { label: "תאריך ייבוא", value: fmtDate(detail.import.importedAt) },
      ],
    });

    if (pageIdx === 0) {
      y = await drawSummaryLines(
        page,
        { he: fonts.he, bold: fonts.heBold },
        [
          { label: "סה״כ רשומות", amount: String(detail.kpis.total), emphasize: true },
          { label: "תואמות", amount: String(detail.kpis.matched) },
          { label: "פערים", amount: String(detail.kpis.differences) },
          { label: "חסרות ב-WEGO", amount: String(detail.kpis.missingInWego) },
          { label: "חסרות בחיצוני", amount: String(detail.kpis.missingInExternal) },
        ],
        PDF_MARGIN,
        y,
        CONTENT_W,
      );
    }

    const dataRows = chunk.map((r) => ({
      customerCode: r.customerCode ?? "—",
      customerName: r.customerName ?? "—",
      turkeyOrder: r.externalOrderId ?? "—",
      wegoOrder: r.wegoOrderNumber !== null ? String(r.wegoOrderNumber) : "—",
      turkeyAmount: fmtAmount(r.externalAmount),
      wegoAmount: fmtAmount(r.wegoAmount),
      difference: r.difference !== null ? fmtAmount(r.difference) : "—",
      status: RECON_STATUS_LABELS_HE[r.status],
    }));

    await drawDataTable(page, { he: fonts.he, num: fonts.num }, COLUMNS, dataRows, PDF_MARGIN, y, CONTENT_W);
    await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
  }

  return pdfDoc.save();
}

async function pdfDocCreate(): Promise<PDFDocument> {
  return PDFDocument.create();
}
