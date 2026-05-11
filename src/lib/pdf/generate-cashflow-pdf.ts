import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { prismaCashFlowToRow } from "@/lib/finance/cashflow-map";
import { formatCurrencyILS, formatDateIL } from "@/lib/pdf/format-currency-pdf";
import {
  CONTENT_W,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  drawFooter,
  drawHeader,
  drawLabeledSection,
} from "@/lib/pdf/invoice-pdf-draw";
import { loadInvoicePdfFonts, paymentMethodLabel, safeFilePart } from "@/lib/pdf/pdf-helpers";

export async function generateCashFlowPdfBytes(entryId: string): Promise<Uint8Array> {
  const entry = await prisma.cashFlowEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("תנועת תזרים לא נמצאה");

  const row = prismaCashFlowToRow(entry);
  const pdfDoc = await PDFDocument.create();
  const loaded = await loadInvoicePdfFonts(pdfDoc);
  const fonts = { he: loaded.he, bold: loaded.heBold, heBold: loaded.heBold, en: loaded.en, enBold: loaded.enBold, num: loaded.num };
  const page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  const entryD = new Date(row.entry_date + "T12:00:00");
  y = drawHeader(
    page,
    { he: fonts.he, heBold: fonts.heBold, enBold: fonts.enBold },
    {
      reportTitleHe: "תזרים מזומנים",
      metaLines: [
        `תאריך: ${formatDateIL(entryD)}`,
        `מזהה תנועה: ${row.id.slice(0, 8)}…`,
        `משתמש: —`,
      ],
    },
  );

  const side =
    row.inflow > 0 ? `הכנסה (${row.entry_type ?? ""})` : row.outflow > 0 ? `הוצאה (${row.entry_type ?? ""})` : "תנועה";
  const amt = row.inflow > 0 ? row.inflow : row.outflow;

  y = drawLabeledSection(
    page,
    fonts,
    "פירוט תנועה",
    [
      { label: "סוג פעולה", value: side },
      { label: "תאריך", value: row.entry_date },
      { label: "תיאור", value: row.description?.trim() || "—" },
      { label: "סכום", value: formatCurrencyILS(amt) },
      { label: "אמצעי תשלום", value: paymentMethodLabel(row.payment_method ?? null) },
      { label: "לקוח / ספק", value: row.customer_name?.trim() || "—" },
      { label: "הערות", value: row.notes?.trim() || "—" },
      ...(row.document_id ? [{ label: "מסמך מקושר", value: row.document_id }] : []),
    ],
    PDF_MARGIN,
    y,
    CONTENT_W,
  );

  drawFooter(page, { en: fonts.en });
  return pdfDoc.save();
}

export function suggestedFileNameForCashflow(entryId: string, entryDate: Date): string {
  const d = entryDate.toISOString().slice(0, 10);
  return `${safeFilePart(`cashflow-${d}`)}_${entryId.slice(0, 8)}.pdf`;
}
