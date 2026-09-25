import { parsePayload } from "@/lib/finance/document-payload";
import { getVatSummary, type VatSummary } from "@/lib/finance/vat-summary";
import { prisma } from "@/lib/prisma";

function day(value: Date | null, fallback: Date): string {
  return (value ?? fallback).toISOString().slice(0, 10);
}

function decimal(value: { toFixed: (digits: number) => string } | number | null | undefined): string {
  if (value == null) return "0.00";
  return typeof value === "number" ? value.toFixed(2) : value.toFixed(2);
}

/** Same dataset the financial summary screen is built from. */
export async function loadVatSummary(from: string, to: string): Promise<VatSummary> {
  const [documents, receipts] = await Promise.all([
    prisma.financialDocument.findMany({
      where: {
        OR: [
          { docDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
          { docDate: null, createdAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } },
        ],
      },
      select: {
        id: true,
        title: true,
        docDate: true,
        createdAt: true,
        metadata: true,
        pdfStoragePath: true,
      },
    }),
    prisma.manualReceipt.findMany({
      where: {
        documentDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      },
      select: {
        id: true,
        supplierName: true,
        documentNumber: true,
        documentType: true,
        documentDate: true,
        amountBeforeVat: true,
        vatAmount: true,
        totalAmount: true,
        vatDeductible: true,
        vatDeductibleAmount: true,
        attachmentPath: true,
        attachmentBucket: true,
        attachmentName: true,
        attachmentMime: true,
      },
    }),
  ]);

  const zReports = [];
  const incomeDocuments = [];
  for (const doc of documents) {
    const payload = parsePayload(doc.metadata);
    const date = payload?.kind === "zreport" && payload.zDate ? payload.zDate : day(doc.docDate, doc.createdAt);
    const attachmentPdf = Boolean(payload && "receiptStoragePath" in payload && payload.receiptStoragePath);
    const hasPdf = Boolean(doc.pdfStoragePath) || attachmentPdf;
    if (payload?.kind === "zreport") {
      zReports.push({
        id: doc.id,
        date,
        label: payload.zNumber || doc.title,
        documentNumber: payload.zNumber || doc.title,
        cashTaxable: payload.cashTaxable,
        cashExempt: payload.cashExempt,
        creditTaxable: payload.creditTaxable,
        hasPdf,
        attachmentPath: payload.receiptStoragePath ?? null,
        attachmentBucket: payload.receiptStorageBucket ?? null,
        attachmentName: payload.receiptFileName ?? null,
        attachmentMime: payload.receiptMimeType ?? null,
      });
    } else if (payload?.kind === "income") {
      incomeDocuments.push({
        id: doc.id,
        date,
        label: doc.title,
        documentNumber: doc.title,
        partyName: payload.counterpartyName,
        documentType: payload.documentType,
        hasPdf,
        attachmentPath: payload.receiptStoragePath ?? null,
        attachmentBucket: payload.receiptStorageBucket ?? null,
        attachmentName: payload.receiptFileName ?? null,
        attachmentMime: payload.receiptMimeType ?? null,
        lines: payload.lines.map((line) => ({
          quantity: line.quantity,
          price: line.price,
          vatMode: line.vatMode,
        })),
      });
    }
  }

  return getVatSummary({
    from,
    to,
    zReports,
    incomeDocuments,
    manualReceipts: receipts.map((row) => ({
      id: row.id,
      date: row.documentDate.toISOString().slice(0, 10),
      label: row.supplierName,
      documentNumber: row.documentNumber || row.supplierName,
      partyName: row.supplierName,
      documentType: row.documentType,
      amountBeforeVat: decimal(row.amountBeforeVat),
      documentVat: decimal(row.vatAmount),
      grossAmount: decimal(row.totalAmount),
      vatDeductibleAmount: decimal(row.vatDeductibleAmount),
      deductible: row.vatDeductible,
      hasPdf: Boolean(row.attachmentPath),
      attachmentPath: row.attachmentPath,
      attachmentBucket: row.attachmentBucket,
      attachmentName: row.attachmentName,
      attachmentMime: row.attachmentMime,
    })),
  });
}
