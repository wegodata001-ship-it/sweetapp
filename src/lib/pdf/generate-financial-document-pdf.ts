import { PDFDocument, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import {
  parsePayload,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { parseNum } from "@/lib/format-shekel";
import { formatCurrencyILS, formatDateIL } from "@/lib/pdf/format-currency-pdf";
import {
  C,
  CONTENT_W,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  drawDataTable,
  drawFooter,
  drawHeader,
  drawLabeledSection,
  drawOpenBalanceBox,
  drawRtlText,
  drawSummaryBoxes,
  drawTwoColPaymentTable,
  type ItemColumn,
} from "@/lib/pdf/invoice-pdf-draw";
import { loadInvoicePdfFonts, paymentMethodLabel, safeFilePart, vatLabel, VAT_RATE } from "@/lib/pdf/pdf-helpers";
import { paymentStatusLabelHe } from "@/lib/finance/payment-status";

const FOOTER_RESERVE = 56;

function reportTitleHe(category: string, payloadKind: string | undefined, documentType: string): string {
  if (payloadKind === "zreport" || documentType === "דוח Z") return "דוח Z";
  if (payloadKind === "expense" || category === "הוצאה") return "דוח הוצאה";
  return "דוח הכנסה";
}

export async function generateFinancialDocumentPdfBytes(documentId: string): Promise<Uint8Array> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    include: {
      customer: true,
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!doc) throw new Error("מסמך לא נמצא");

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
  let page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  const payload = parsePayload(doc.metadata as unknown);
  const isExpense = doc.category === "הוצאה" || payload?.kind === "expense";
  const isZ = payload?.kind === "zreport" || doc.documentType === "דוח Z";
  const paidAmount = isZ
    ? doc.totalAmount
    : doc.category === "הכנסה"
      ? doc.payments.reduce((sum, payment) => sum + Math.max(0, payment.amount), 0)
      : doc.paidAmount;
  const remainingAmount = Math.max(0, doc.totalAmount - paidAmount);
  const paymentStatus =
    doc.totalAmount <= 0 ? "unpaid" : remainingAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  const depositSource = doc as typeof doc & {
    depositAmount?: number | null;
    depositType?: string | null;
    depositNote?: string | null;
    depositStatus?: string | null;
  };
  const depositAmount =
    depositSource.depositAmount ??
    (payload && payload.kind !== "zreport"
      ? parseNum(String((payload as IncomeExpensePayload).depositAmount ?? ""))
      : 0);

  const counterpartyLabel = isExpense ? "ספק / גורם" : "לקוח";
  const counterpartyName =
    doc.customer?.name ??
    (payload && payload.kind !== "zreport" ? (payload as IncomeExpensePayload).counterpartyName : "") ??
    "—";
  const phone = doc.customer?.phone?.trim() || "—";

  const docDate = doc.docDate ?? doc.createdAt;
  const metaLines = [
    `תאריך: ${formatDateIL(docDate)}`,
    `מספר מסמך: ${doc.id.slice(0, 8)}…`,
    `משתמש: —`,
  ];

  y = drawHeader(page, { he: fonts.he, heBold: fonts.heBold, enBold: fonts.enBold }, {
    reportTitleHe: reportTitleHe(doc.category, payload?.kind, doc.documentType),
    metaLines,
  });

  const ensureSpace = (need: number) => {
    if (y - need < PDF_MARGIN + FOOTER_RESERVE) {
      page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      y = PDF_PAGE_H - PDF_MARGIN;
    }
  };

  ensureSpace(120);
  y = drawLabeledSection(
    page,
    fonts,
    "פרטי מסמך",
    [
      { label: "סוג מסמך", value: doc.documentType || "—" },
      { label: "כותרת", value: doc.title || "—" },
      { label: "תאריך מסמך", value: formatDateIL(docDate) },
      { label: "סטטוס תשלום", value: paymentStatusLabelHe(paymentStatus) },
    ],
    PDF_MARGIN,
    y,
    CONTENT_W,
  );

  if (!isZ) {
    ensureSpace(100);
    const firstPay = doc.payments[0];
    const firstPayloadPay =
      payload?.kind === "income" || payload?.kind === "expense"
        ? (payload as IncomeExpensePayload).payments[0]
        : undefined;
    const payInstr =
      firstPay?.paymentMethod != null
        ? paymentMethodLabel(firstPay.paymentMethod)
        : firstPayloadPay
          ? paymentMethodLabel(firstPayloadPay.instrument ?? null)
          : "—";
    y = drawLabeledSection(page, fonts, isExpense ? "פרטי ספק" : "פרטי לקוח", [
      { label: counterpartyLabel, value: counterpartyName || "—" },
      { label: "טלפון", value: phone !== "" ? phone : "—" },
      { label: "אמצעי תשלום (ראשון)", value: payInstr },
    ], PDF_MARGIN, y, CONTENT_W);
  }

  if (isZ && payload?.kind === "zreport") {
    const z = payload as ZReportPayload;
    const cashTotal = z.cashTaxable + z.cashExempt;
    const creditTotal = z.creditTaxable + z.creditExempt;
    const gross = cashTotal + creditTotal + z.transfers;
    ensureSpace(160);
    y = drawLabeledSection(page, fonts, "סיכום דוח Z", [
      { label: "מספר דוח Z", value: z.zNumber || "—" },
      { label: "תאריך דוח", value: z.zDate || "—" },
      { label: "מזומן חייב", value: formatCurrencyILS(z.cashTaxable) },
      { label: "מזומן פטור", value: formatCurrencyILS(z.cashExempt) },
      { label: "סה״כ מזומן", value: formatCurrencyILS(cashTotal) },
      { label: "אשראי חייב", value: formatCurrencyILS(z.creditTaxable) },
      { label: "אשראי פטור", value: formatCurrencyILS(z.creditExempt) },
      { label: "סה״כ אשראי", value: formatCurrencyILS(creditTotal) },
      { label: "העברות בנק", value: formatCurrencyILS(z.transfers) },
      { label: "סה״כ פעולות", value: formatCurrencyILS(gross) },
    ], PDF_MARGIN, y, CONTENT_W);
  } else if (doc.items.length > 0) {
    const cols: ItemColumn[] = [
      { key: "item", width: 280, header: "פריט" },
      { key: "qty", width: 56, header: "כמות", numeric: true },
      { key: "price", width: 88, header: "מחיר", numeric: true },
      { key: "vat", width: 92, header: 'מע״מ' },
      { key: "total", width: 100, header: 'סה״כ', numeric: true },
    ];
    const dataRows = doc.items.map((it) => ({
      item: it.itemName || "—",
      qty: String(it.quantity),
      price: formatCurrencyILS(it.unitPrice),
      vat: vatLabel(it.vatType),
      total: formatCurrencyILS(it.total),
    }));
    const headerH = 30;
    const rowH = 28;
    const tableH = headerH + dataRows.length * rowH + 44;
    ensureSpace(tableH);
    drawRtlText(page, fonts.heBold, "טבלת פריטים", PDF_MARGIN + CONTENT_W - 18, y - 6, 13, C.text);
    y -= 28;
    y = drawDataTable(page, { he: fonts.he, num: fonts.num }, cols, dataRows, PDF_MARGIN, y, CONTENT_W);
  }

  if (!isZ && doc.items.length > 0) {
    const vatAmount = doc.items.reduce((sum, it) => {
      if (it.vatType === "exempt") return sum;
      if (it.vatType === "before_vat") return sum + it.total - it.unitPrice * it.quantity;
      return sum + it.total - it.total / (1 + VAT_RATE);
    }, 0);
    const productTotal = doc.items.reduce((sum, it) => sum + it.total, 0);
    const netAmount = productTotal - vatAmount;
    ensureSpace(110);
    y = drawSummaryBoxes(
      page,
      fonts,
      [
        { label: "לפני מע״מ", amount: formatCurrencyILS(netAmount), bg: C.summaryNetBg, fg: C.text },
        { label: 'מע״מ', amount: formatCurrencyILS(vatAmount), bg: C.summaryVatBg, fg: C.white },
        { label: "סה״כ", amount: formatCurrencyILS(doc.totalAmount), bg: C.summaryTotalBg, fg: C.white },
      ],
      PDF_MARGIN,
      y,
      CONTENT_W,
    );
    if (depositAmount > 1e-6) {
      ensureSpace(40);
      drawRtlText(page, fonts.he, `פיקדון: ${formatCurrencyILS(depositAmount)}`, PDF_MARGIN + CONTENT_W - 18, y, 10, C.muted);
      y -= 22;
    }
  }

  const paymentRows =
    doc.payments.length > 0
      ? doc.payments.map((pay) => ({
          method: paymentMethodLabel(pay.paymentMethod),
          amount: formatCurrencyILS(pay.amount),
        }))
      : payload?.kind === "income" || payload?.kind === "expense"
        ? (payload as IncomeExpensePayload).payments
            .filter((pay) => parseNum(pay.amount) > 1e-9)
            .map((pay) => ({
              method: paymentMethodLabel(pay.instrument),
              amount: formatCurrencyILS(parseNum(pay.amount)),
            }))
        : [];

  if (!isZ && paymentRows.length > 0) {
    ensureSpace(36);
    drawRtlText(page, fonts.heBold, "אמצעי תשלום", PDF_MARGIN + CONTENT_W - 18, y - 4, 13, C.text);
    y -= 26;
    const th = 28 + paymentRows.length * 26 + 20;
    ensureSpace(th);
    y = drawTwoColPaymentTable(page, fonts, paymentRows, PDF_MARGIN, y, CONTENT_W);
  }

  if (!isZ) {
    ensureSpace(70);
    drawRtlText(page, fonts.he, `סה״כ מסמך: ${formatCurrencyILS(doc.totalAmount)}`, PDF_MARGIN + CONTENT_W - 18, y, 11, C.text);
    y -= 18;
    drawRtlText(page, fonts.he, `שולם: ${formatCurrencyILS(paidAmount)}`, PDF_MARGIN + CONTENT_W - 18, y, 11, rgb(5 / 255, 150 / 255, 105 / 255));
    y -= 18;
    drawRtlText(page, fonts.he, `יתרה פתוחה: ${formatCurrencyILS(remainingAmount)}`, PDF_MARGIN + CONTENT_W - 18, y, 11, C.text);
    y -= 22;

    if (remainingAmount > 1e-6) {
      ensureSpace(54);
      y = drawOpenBalanceBox(page, fonts, formatCurrencyILS(remainingAmount), PDF_MARGIN, y, CONTENT_W);
    }
  }

  if (doc.notes?.trim()) {
    ensureSpace(40);
    y = drawLabeledSection(page, fonts, "הערות", [{ label: "מסמך", value: doc.notes.trim() }], PDF_MARGIN, y, CONTENT_W);
  }

  drawFooter(page, { en: fonts.en });

  return pdfDoc.save();
}

export function suggestedFileNameForDocument(doc: {
  id: string;
  customer: { name: string } | null;
  docDate: Date | null;
  createdAt: Date;
  title: string;
}): string {
  const clientName = safeFilePart(doc.customer?.name || doc.title || "DOC");
  const datePart = (doc.docDate ?? doc.createdAt).toISOString().slice(0, 10);
  return `${clientName}_${datePart}_${doc.id.slice(0, 8)}.pdf`;
}
