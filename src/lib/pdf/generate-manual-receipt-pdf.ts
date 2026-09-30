import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { decodeManualReceiptDetails } from "@/lib/finance/manual-receipt-lines";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/document-payload";
import { formatCurrencyILS, formatDateIL } from "@/lib/pdf/format-currency-pdf";
import {
  CONTENT_W,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  drawDataTable,
  drawFooter,
  drawHeader,
  drawLabeledSection,
  drawSummaryLines,
  type ItemColumn,
} from "@/lib/pdf/invoice-pdf-draw";
import { loadInvoicePdfFonts } from "@/lib/pdf/pdf-helpers";

function moneyLabel(value: { toFixed: (digits: number) => string } | string): string {
  const raw = typeof value === "string" ? value : value.toFixed(2);
  const amount = Number(raw);
  return Number.isFinite(amount) ? formatCurrencyILS(amount) : raw;
}

export async function generateManualReceiptPdfBytes(receiptId: string): Promise<Uint8Array> {
  const row = await prisma.manualReceipt.findUnique({ where: { id: receiptId } });
  if (!row) throw new Error("הקבלה לא נמצאה");
  const details = decodeManualReceiptDetails(row.description);

  const pdfDoc = await PDFDocument.create();
  const loaded = await loadInvoicePdfFonts(pdfDoc);
  const fonts = {
    he: loaded.he,
    bold: loaded.heBold,
    heBold: loaded.heBold,
    en: loaded.en,
    enBold: loaded.enBold,
    num: loaded.num,
  };
  const page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  y = await drawHeader(page, { he: fonts.he, heBold: fonts.heBold, enBold: fonts.enBold }, {
    reportTitleHe: row.documentType,
    metaFields: [
      { label: "מספר מסמך", value: row.documentNumber || "—" },
      { label: "תאריך", value: formatDateIL(row.documentDate) },
      { label: "ספק", value: row.supplierName },
    ],
  });

  const supplierRows = [
    { label: "שם הספק", value: row.supplierName },
    ...(row.supplierTaxId ? [{ label: "עוסק מורשה / ח.פ.", value: row.supplierTaxId }] : []),
    ...(details.phone ? [{ label: "טלפון", value: details.phone }] : []),
    ...(details.address ? [{ label: "כתובת", value: details.address }] : []),
  ];
  y = await drawLabeledSection(page, fonts, "פרטי הספק", supplierRows, PDF_MARGIN, y, CONTENT_W);

  const lines = details.lines.length
    ? details.lines
    : [{ description: details.note || "—", quantity: "1", unitPrice: row.totalAmount.toFixed(2), amount: row.totalAmount.toFixed(2) }];
  const cols: ItemColumn[] = [
    { key: "qty", width: 90, header: "כמות" },
    { key: "details", width: 360, header: "פרטים" },
    { key: "price", width: 150, header: "מחיר יחידה" },
    { key: "amount", width: 150, header: "סכום" },
  ];
  y = await drawDataTable(
    page,
    { he: fonts.he, num: fonts.num },
    cols,
    lines.map((line) => ({
      qty: line.quantity,
      details: line.description || "—",
      price: moneyLabel(line.unitPrice),
      amount: moneyLabel(line.amount),
    })),
    PDF_MARGIN,
    y,
    CONTENT_W,
  );

  y = await drawSummaryLines(
    page,
    fonts,
    [
      { label: "סה״כ לפני מע״מ", amount: moneyLabel(row.amountBeforeVat) },
      { label: "מע״מ", amount: moneyLabel(row.vatAmount) },
      { label: "סה״כ כולל מע״מ", amount: moneyLabel(row.totalAmount), emphasize: true },
    ],
    PDF_MARGIN,
    y,
    CONTENT_W,
  );

  const payment = row.paymentMethod
    ? PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? row.paymentMethod
    : "—";
  y = await drawLabeledSection(
    page,
    fonts,
    "תשלום",
    [
      { label: "אמצעי תשלום", value: payment },
      { label: "הערה", value: details.note || "—" },
    ],
    PDF_MARGIN,
    y,
    CONTENT_W,
  );
  void y;

  await drawFooter(page, { en: fonts.en, enBold: fonts.enBold });
  return pdfDoc.save();
}
