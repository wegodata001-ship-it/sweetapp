import { prisma } from "@/lib/prisma";

/** סטטוסים שמוצגים כ"חשבונית פתוחה" */
export const OPEN_INVOICE_PAYMENT_STATUSES = ["unpaid", "partial", "overdue", "UNPAID", "PARTIAL"] as const;

/** לא לספור */
export const CLOSED_INVOICE_PAYMENT_STATUSES = [
  "paid",
  "cancelled",
  "canceled",
  "void",
  "refunded",
  "draft",
  "PAID",
  "CANCELLED",
] as const;

export type OpenInvoiceRow = {
  id: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  documentType: string;
};

export function isOpenInvoiceDoc(doc: {
  paymentStatus: string;
  remainingAmount: number;
  totalAmount: number;
  paidAmount?: number;
}): boolean {
  const status = (doc.paymentStatus ?? "").trim().toLowerCase();
  if (CLOSED_INVOICE_PAYMENT_STATUSES.some((s) => s.toLowerCase() === status)) {
    return false;
  }
  if (status === "paid" || status === "cancelled" || status === "canceled") {
    return false;
  }
  const remaining =
    doc.remainingAmount > 0.01
      ? doc.remainingAmount
      : Math.max(0, doc.totalAmount - (doc.paidAmount ?? 0));
  return remaining > 0.01;
}

export async function fetchOpenIncomeDocuments(): Promise<OpenInvoiceRow[]> {
  const rows = await prisma.financialDocument.findMany({
    where: { category: "הכנסה" },
    select: {
      id: true,
      paymentStatus: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      documentType: true,
    },
  });
  return rows.filter(isOpenInvoiceDoc);
}

export async function countOpenInvoices(opts?: { log?: boolean }): Promise<number> {
  const open = await fetchOpenIncomeDocuments();
  if (opts?.log) {
    console.log("[DASHBOARD OPEN INVOICES]", {
      total: open.length,
      ids: open.map((r) => r.id),
      statuses: open.map((r) => r.paymentStatus),
      types: open.map((r) => r.documentType),
    });
  }
  return open.length;
}
