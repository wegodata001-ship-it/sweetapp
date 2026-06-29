import { prismaAny } from "@/lib/prisma";

/**
 * שילוב תשלומי הזמנות בתזרים המזומנים — לוגיקה חדשה ומבודדת.
 *
 * עקרונות בטיחות (מערכת פעילה):
 *  - תוספת בלבד: לא נוגעים בשורות CashFlowEntry קיימות, לא משנים FinancialDocument/Payment.
 *  - כל שורה מסומנת ב-source ייעודי (order_*) וב-relatedOrderId/orderPaymentId,
 *    כך שאף "מפיק" קיים (document-side-effects) לא ימחק או יגע בה.
 *  - ביטול לא מוחק — יוצר תנועה נגדית בלבד (audit מלא).
 *  - הכל best-effort: כשל אינו חוסם שמירת הזמנה.
 *
 * מיפוי לכניסה/יציאה משתמש ב-entryType קיימים בלבד (income/deposit/refund/deposit_refund)
 * כדי ש-prismaCashFlowToRow יחשב inflow/outflow נכון ללא שינוי המיפוי.
 */

export type OrderPaymentKind = "DEPOSIT" | "PAYMENT" | "REFUND";

export const ORDER_PAYMENT_KINDS: readonly OrderPaymentKind[] = ["DEPOSIT", "PAYMENT", "REFUND"];

export const ORDER_CASHFLOW_SOURCES = {
  deposit: "order_deposit",
  payment: "order_payment",
  refund: "order_refund",
  depositCancel: "order_deposit_cancel",
  paymentCancel: "order_payment_cancel",
  refundCancel: "order_refund_cancel",
} as const;

export function isOrderPaymentKind(value: string): value is OrderPaymentKind {
  return (ORDER_PAYMENT_KINDS as readonly string[]).includes(value);
}

type OrderInfo = {
  id: string;
  orderNumber: number;
  customerName: string | null;
};

type OrderPaymentRow = {
  id: string;
  kind: string;
  amount: number;
  paymentMethod: string | null;
  paidAt: Date;
  notes: string | null;
};

function eps(n: number): number {
  return Number.isFinite(n) && n > 1e-9 ? n : 0;
}

/** תווית עברית לתצוגה בתזרים (description) — נושאת את מספר ההזמנה והגורם */
function describePayment(kind: OrderPaymentKind, order: OrderInfo): string {
  const num = `#${order.orderNumber}`;
  const who = order.customerName?.trim() ? ` — ${order.customerName.trim()}` : "";
  switch (kind) {
    case "DEPOSIT":
      return `מקדמת הזמנה ${num}${who}`;
    case "REFUND":
      return `החזר הזמנה ${num}${who}`;
    default:
      return `תשלום הזמנה ${num}${who}`;
  }
}

function entryConfigForKind(kind: OrderPaymentKind): { entryType: string; source: string } {
  switch (kind) {
    case "DEPOSIT":
      return { entryType: "deposit", source: ORDER_CASHFLOW_SOURCES.deposit };
    case "REFUND":
      return { entryType: "refund", source: ORDER_CASHFLOW_SOURCES.refund };
    default:
      return { entryType: "income", source: ORDER_CASHFLOW_SOURCES.payment };
  }
}

/** הכיוון ההפוך לביטול — שומר על אותו סכום חיובי, רק הופך כניסה<->יציאה */
function reverseConfigForKind(kind: OrderPaymentKind): { entryType: string; source: string } {
  switch (kind) {
    case "DEPOSIT":
      return { entryType: "deposit_refund", source: ORDER_CASHFLOW_SOURCES.depositCancel };
    case "REFUND":
      return { entryType: "income", source: ORDER_CASHFLOW_SOURCES.refundCancel };
    default:
      return { entryType: "refund", source: ORDER_CASHFLOW_SOURCES.paymentCancel };
  }
}

/** יוצר תנועת תזרים עבור תשלום הזמנה (idempotent לפי orderPaymentId). */
export async function createCashFlowForOrderPayment(
  payment: OrderPaymentRow,
  order: OrderInfo,
): Promise<void> {
  try {
    const kind = isOrderPaymentKind(payment.kind) ? payment.kind : "PAYMENT";
    const amount = eps(Number(payment.amount));
    if (!amount) return;

    const { entryType, source } = entryConfigForKind(kind);

    // idempotency — לא ליצור פעמיים את תנועת המקור עבור אותה רשומת תשלום
    const existing = await prismaAny.cashFlowEntry.findFirst({
      where: { orderPaymentId: payment.id, source },
      select: { id: true },
    });
    if (existing) return;
    await prismaAny.cashFlowEntry.create({
      data: {
        entryType,
        amount,
        description: describePayment(kind, order),
        paymentMethod: payment.paymentMethod ?? null,
        source,
        relatedOrderId: order.id,
        orderPaymentId: payment.id,
        customerId: null,
        customerName: order.customerName ?? null,
        notes: payment.notes ?? null,
        entryDate: payment.paidAt,
        isDirect: false,
        documentId: null,
        relatedDocumentId: null,
        zReportId: null,
        paymentId: null,
      },
    });
  } catch (e) {
    console.error("[order-cashflow-sync] createCashFlowForOrderPayment failed", {
      orderPaymentId: payment.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** יוצר תנועה נגדית בעת ביטול תשלום — לא מוחק את המקור (audit). idempotent. */
export async function reverseCashFlowForOrderPayment(
  payment: OrderPaymentRow,
  order: OrderInfo,
  cancelledAt: Date,
): Promise<void> {
  try {
    const kind = isOrderPaymentKind(payment.kind) ? payment.kind : "PAYMENT";
    const amount = eps(Number(payment.amount));
    if (!amount) return;

    const { entryType, source } = reverseConfigForKind(kind);

    const existing = await prismaAny.cashFlowEntry.findFirst({
      where: { orderPaymentId: payment.id, source },
      select: { id: true },
    });
    if (existing) return;

    await prismaAny.cashFlowEntry.create({
      data: {
        entryType,
        amount,
        description: `ביטול — ${describePayment(kind, order)}`,
        paymentMethod: payment.paymentMethod ?? null,
        source,
        relatedOrderId: order.id,
        orderPaymentId: payment.id,
        customerId: null,
        customerName: order.customerName ?? null,
        notes: payment.notes ?? null,
        entryDate: cancelledAt,
        isDirect: false,
        documentId: null,
        relatedDocumentId: null,
        zReportId: null,
        paymentId: null,
      },
    });
  } catch (e) {
    console.error("[order-cashflow-sync] reverseCashFlowForOrderPayment failed", {
      orderPaymentId: payment.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
