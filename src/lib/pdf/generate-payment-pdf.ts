import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
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

export async function generatePaymentPdfBytes(paymentId: string): Promise<Uint8Array> {
  const pay = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, document: true },
  });
  if (!pay) throw new Error("תשלום לא נמצא");

  const pdfDoc = await PDFDocument.create();
  const loaded = await loadInvoicePdfFonts(pdfDoc);
  const fonts = { he: loaded.he, bold: loaded.heBold, heBold: loaded.heBold, en: loaded.en, enBold: loaded.enBold, num: loaded.num };
  const page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  y = drawHeader(
    page,
    { he: fonts.he, heBold: fonts.heBold, enBold: fonts.enBold },
    {
      reportTitleHe: "קבלת תשלום",
      metaLines: [
        `תאריך: ${formatDateIL(pay.createdAt)}`,
        `מספר תשלום: ${pay.id.slice(0, 8)}…`,
        `משתמש: —`,
      ],
    },
  );

  y = drawLabeledSection(
    page,
    fonts,
    "פרטי תשלום",
    [
      { label: "לקוח", value: pay.customer.name },
      { label: "מסמך", value: pay.document?.title ?? "—" },
      { label: "סכום", value: formatCurrencyILS(pay.amount) },
      { label: "אמצעי תשלום", value: paymentMethodLabel(pay.paymentMethod) },
      ...(pay.notes?.trim() ? [{ label: "הערה", value: pay.notes.trim() }] : []),
    ],
    PDF_MARGIN,
    y,
    CONTENT_W,
  );

  drawFooter(page, { en: fonts.en });
  return pdfDoc.save();
}

export function suggestedFileNameForPayment(pay: {
  id: string;
  customer: { name: string };
  createdAt: Date;
}): string {
  const name = safeFilePart(pay.customer.name);
  const d = pay.createdAt.toISOString().slice(0, 10);
  return `payment-${name}-${d}-${pay.id.slice(0, 8)}.pdf`;
}
