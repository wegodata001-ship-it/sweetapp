import { parsePayload, paymentLinesTotal } from "@/lib/finance/document-payload";

export function computeDocumentPaymentTotals(input: {
  totalAmount: number;
  documentType: string;
  metadata: unknown;
  paidFromDb: number;
}): { paid: number; remaining: number; paymentStatus: string } {
  if (input.documentType === "דוח Z") {
    const paid = input.totalAmount;
    return {
      paid,
      remaining: 0,
      paymentStatus: input.totalAmount <= 0 ? "unpaid" : "paid",
    };
  }
  const payload = parsePayload(input.metadata);
  let paid: number;
  if (input.paidFromDb > 1e-9) {
    paid = input.paidFromDb;
  } else if (payload?.kind === "income" || payload?.kind === "expense") {
    paid = paymentLinesTotal(payload);
  } else {
    paid = 0;
  }
  const remaining = Math.max(0, input.totalAmount - paid);
  const paymentStatus =
    input.totalAmount <= 0 ? "unpaid" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { paid, remaining, paymentStatus };
}
