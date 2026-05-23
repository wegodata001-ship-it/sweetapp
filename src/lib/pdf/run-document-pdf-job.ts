import { prisma } from "@/lib/prisma";
import { inferReportTypeForDocumentId, titleForReportType } from "@/lib/pdf/classify-report";
import { generateFinancialDocumentPdfBytes } from "@/lib/pdf/generate-financial-document-pdf";
import { generatePaymentPdfBytes } from "@/lib/pdf/generate-payment-pdf";
import { persistGeneratedReport } from "@/lib/pdf/persist-generated-report";
import { REPORT_TYPES } from "@/lib/pdf/constants";
import { erpReportFileName } from "@/lib/storage/report-file-names";

export type PdfJobResult = {
  publicUrl: string;
  reportId: string;
  pdfUrl: string;
};

/** יצירת PDF + העלאה ל-Storage + עדכון מסמך — לריצה ברקע בלבד */
export async function runDocumentPdfJob(
  documentId: string,
  createdById: string,
): Promise<PdfJobResult> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, docDate: true, createdAt: true },
  });
  if (!doc) throw new Error("מסמך לא נמצא");

  const reportType = await inferReportTypeForDocumentId(documentId);
  const bytes = await generateFinancialDocumentPdfBytes(documentId);
  const docDate = doc.docDate ?? doc.createdAt;
  const fileName = erpReportFileName(reportType, docDate, new Date());

  const { report, publicUrl } = await persistGeneratedReport({
    type: reportType,
    title: titleForReportType(reportType, doc.title),
    relatedId: documentId,
    fileName,
    pdfBytes: bytes,
    createdById,
  });

  await prisma.financialDocument.update({
    where: { id: documentId },
    data: { pdfStoragePath: report.filePath },
  });

  return { publicUrl, reportId: report.id, pdfUrl: publicUrl };
}

export async function runPaymentPdfJob(
  paymentId: string,
  createdById: string,
): Promise<PdfJobResult> {
  const pay = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: { select: { name: true } } },
  });
  if (!pay) throw new Error("תשלום לא נמצא");

  const bytes = await generatePaymentPdfBytes(paymentId);
  const fileName = erpReportFileName(REPORT_TYPES.PAYMENT, pay.createdAt, new Date());

  const { report, publicUrl } = await persistGeneratedReport({
    type: REPORT_TYPES.PAYMENT,
    title: titleForReportType(REPORT_TYPES.PAYMENT, pay.customer.name),
    relatedId: paymentId,
    fileName,
    pdfBytes: bytes,
    createdById,
  });

  return { publicUrl, reportId: report.id, pdfUrl: publicUrl };
}
