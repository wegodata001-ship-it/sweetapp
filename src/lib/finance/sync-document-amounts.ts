import type { Prisma, PrismaClient } from "@prisma/client";
import { computeDocumentPaymentTotals } from "@/lib/finance/payment-totals";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | PrismaClient;

/** paidAmount / remainingAmount נגזרים מתשלומים — לא לערוך ידנית. */
export async function syncFinancialDocumentPaymentTotals(documentId: string, db: Db = prisma): Promise<void> {
  const doc = await db.financialDocument.findUnique({
    where: { id: documentId },
    select: { id: true, totalAmount: true, documentType: true, metadata: true },
  });
  if (!doc) return;

  const agg = await db.payment.aggregate({
    where: { documentId },
    _sum: { amount: true },
  });
  const totals = computeDocumentPaymentTotals({
    totalAmount: doc.totalAmount,
    documentType: doc.documentType,
    metadata: doc.metadata,
    paidFromDb: agg._sum.amount ?? 0,
  });

  await db.financialDocument.update({
    where: { id: documentId },
    data: {
      paidAmount: totals.paid,
      remainingAmount: totals.remaining,
      paymentStatus: totals.paymentStatus,
    },
  });
}
