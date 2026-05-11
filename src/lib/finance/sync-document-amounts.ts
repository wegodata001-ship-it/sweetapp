import { prisma } from "@/lib/prisma";
import { parsePayload, paymentLinesTotal } from "@/lib/finance/document-payload";

/** paidAmount / remainingAmount נגזרים מתשלומים — לא לערוך ידנית. */
export async function syncFinancialDocumentPaymentTotals(documentId: string): Promise<void> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { id: true, totalAmount: true, documentType: true, metadata: true },
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
        paymentStatus: doc.totalAmount <= 0 ? "unpaid" : "paid",
      },
    });
    return;
  }

  const payload = parsePayload(doc.metadata as unknown);
  const agg = await prisma.payment.aggregate({
    where: { documentId },
    _sum: { amount: true },
  });
  const paidFromDb = agg._sum.amount ?? 0;

  let paid: number;
  if (paidFromDb > 1e-9) {
    paid = paidFromDb;
  } else if (payload?.kind === "income" || payload?.kind === "expense") {
    paid = paymentLinesTotal(payload);
  } else {
    paid = 0;
  }
  const remaining = Math.max(0, doc.totalAmount - paid);
  const paymentStatus =
    doc.totalAmount <= 0 ? "unpaid" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

  await prisma.financialDocument.update({
    where: { id: documentId },
    data: {
      paidAmount: paid,
      remainingAmount: remaining,
      paymentStatus,
    },
  });
}
