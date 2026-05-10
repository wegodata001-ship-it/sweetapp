import { prisma } from "@/lib/prisma";

/** paidAmount / remainingAmount נגזרים מתשלומים — לא לערוך ידנית. */
export async function syncFinancialDocumentPaymentTotals(documentId: string): Promise<void> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { id: true, totalAmount: true, documentType: true },
  });
  if (!doc) return;

  /** דוח Z — סגירת קופה; כל הסכום נחשב כשולם (אין תשלומי Payment נפרדים). */
  if (doc.documentType === "דוח Z") {
    const paid = doc.totalAmount;
    await prisma.financialDocument.update({
      where: { id: documentId },
      data: {
        paidAmount: paid,
        remainingAmount: 0,
        paymentStatus: doc.totalAmount <= 0 ? "UNPAID" : "PAID",
      },
    });
    return;
  }

  const agg = await prisma.payment.aggregate({
    where: { documentId },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? 0;
  const remaining = Math.max(0, doc.totalAmount - paid);
  const paymentStatus =
    doc.totalAmount <= 0 ? "UNPAID" : remaining <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

  await prisma.financialDocument.update({
    where: { id: documentId },
    data: {
      paidAmount: paid,
      remainingAmount: remaining,
      paymentStatus,
    },
  });
}
