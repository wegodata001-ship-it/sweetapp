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

/** מסמן תשלום שמנוהל אוטומטית משדה המקדמה בטופס ההזמנה */
export const AUTO_DEPOSIT_SOURCE = "ORDER_DEPOSIT_FIELD";

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

type OrderDepositInput = {
  id: string;
  orderNumber: number;
  customerName: string | null;
  depositPaid: boolean;
  depositAmount: number;
  depositMethod: string | null;
  status: string;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * מסנכרן את שדה המקדמה של ההזמנה לתנועת תזרים אוטומטית (DEPOSIT) — append-only:
 *  - מקדמה ששולמה ואין עדיין תנועה → יצירת תנועה (+).
 *  - שינוי סכום/אמצעי → ביטול הישנה (תנועה נגדית) ויצירת חדשה (audit מלא, ללא עדכון שורות).
 *  - בוטל הסימון "שולם"/ירד ל-0/בוטלה ההזמנה → ביטול התנועה (תנועה נגדית).
 * idempotent: ריצה חוזרת ללא שינוי לא יוצרת כפילויות. best-effort.
 */
export async function syncOrderDepositField(
  order: OrderDepositInput,
  createdById?: string | null,
): Promise<void> {
  try {
    const desiredAmount = round2(order.depositAmount);
    const desiredMethod = order.depositMethod?.trim() || "CASH";
    const wantDeposit =
      Boolean(order.depositPaid) && desiredAmount > 0 && order.status !== "CANCELLED";

    const orderInfo = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
    };

    const active = (await prismaAny.orderPayment.findFirst({
      where: { orderId: order.id, autoSource: AUTO_DEPOSIT_SOURCE, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    })) as {
      id: string;
      kind: string;
      amount: number;
      paymentMethod: string | null;
      paidAt: Date;
      notes: string | null;
    } | null;

    const createAuto = async () => {
      const payment = (await prismaAny.orderPayment.create({
        data: {
          orderId: order.id,
          kind: "DEPOSIT",
          amount: desiredAmount,
          paymentMethod: desiredMethod,
          paidAt: new Date(),
          status: "ACTIVE",
          autoSource: AUTO_DEPOSIT_SOURCE,
          createdById: createdById ?? null,
        },
      })) as {
        id: string;
        kind: string;
        amount: number;
        paymentMethod: string | null;
        paidAt: Date;
        notes: string | null;
      };
      await createCashFlowForOrderPayment(payment, orderInfo);
    };

    const cancelActive = async () => {
      if (!active) return;
      const cancelledAt = new Date();
      await prismaAny.orderPayment.update({
        where: { id: active.id },
        data: { status: "CANCELLED", cancelledAt, cancelledById: createdById ?? null },
      });
      await reverseCashFlowForOrderPayment(active, orderInfo, cancelledAt);
    };

    if (wantDeposit) {
      if (!active) {
        await createAuto();
      } else {
        const amountChanged = Math.abs(Number(active.amount) - desiredAmount) > 1e-9;
        const methodChanged = (active.paymentMethod ?? "").trim() !== desiredMethod;
        if (amountChanged || methodChanged) {
          await cancelActive();
          await createAuto();
        }
      }
    } else if (active) {
      await cancelActive();
    }
  } catch (e) {
    console.error("[order-cashflow-sync] syncOrderDepositField failed", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

let depositsBackfilled = false;

/**
 * Backfill חד-פעמי (פעם אחת לכל תהליך): מסנכרן מקדמות של הזמנות קיימות לתזרים.
 * idempotent — syncOrderDepositField יוצר רק כשאין כבר תנועה פעילה, ללא כפילויות.
 */
export async function backfillOrderDepositsOnce(): Promise<void> {
  if (depositsBackfilled) return;
  depositsBackfilled = true;
  try {
    const orders = (await prismaAny.futureOrder.findMany({
      where: { depositPaid: true, depositAmount: { gt: 0 }, status: { not: "CANCELLED" } },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        depositPaid: true,
        depositAmount: true,
        depositMethod: true,
        status: true,
      },
    })) as OrderDepositInput[];
    for (const order of orders) {
      await syncOrderDepositField(order, null);
    }
  } catch (e) {
    depositsBackfilled = false;
    console.error("[order-cashflow-sync] backfillOrderDepositsOnce failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * ביטול הזמנה — יוצר תנועה נגדית לכל תשלום פעיל (אוטומטי וידני) ומסמן CANCELLED.
 * לא מוחק רשומות. idempotent (אין תשלומים פעילים → no-op). best-effort.
 */
export async function reverseAllActiveOrderPayments(
  order: { id: string; orderNumber: number; customerName: string | null },
  cancelledById?: string | null,
): Promise<void> {
  try {
    const actives = (await prismaAny.orderPayment.findMany({
      where: { orderId: order.id, status: "ACTIVE" },
    })) as Array<{
      id: string;
      kind: string;
      amount: number;
      paymentMethod: string | null;
      paidAt: Date;
      notes: string | null;
    }>;
    if (!actives.length) return;

    const orderInfo = { id: order.id, orderNumber: order.orderNumber, customerName: order.customerName };
    for (const p of actives) {
      const cancelledAt = new Date();
      await prismaAny.orderPayment.update({
        where: { id: p.id },
        data: { status: "CANCELLED", cancelledAt, cancelledById: cancelledById ?? null },
      });
      await reverseCashFlowForOrderPayment(p, orderInfo, cancelledAt);
    }
  } catch (e) {
    console.error("[order-cashflow-sync] reverseAllActiveOrderPayments failed", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
