import { prisma, prismaAny } from "@/lib/prisma";
import { parsePayload } from "@/lib/finance/document-payload";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import { syncCashflowShortageNotifications } from "@/lib/notifications/checkCashflowShortage";
import { parseDateKey } from "@/lib/finance/cashflow-forecast/date-utils";
import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";

function parseDueDate(input: string): Date | null {
  const key = parseDateKey(input);
  if (!key) return null;
  return new Date(`${key}T12:00:00.000Z`);
}

async function afterForecastMutation(): Promise<void> {
  await syncCashflowShortageNotifications();
}

/** דחיית תשלום יציאה — מעדכן תאריך פירעון / ביצוע */
export async function deferForecastOutflow(params: {
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  newDueDate: string;
}): Promise<void> {
  const due = parseDueDate(params.newDueDate);
  if (!due) throw new Error("תאריך לא תקין");
  const iso = due.toISOString().slice(0, 10);

  if (params.sourceType === "check_in") {
    await prisma.checkPayment.update({
      where: { id: params.sourceId },
      data: { dueDate: due },
    });
    await afterForecastMutation();
    return;
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: params.sourceId },
    select: { id: true, metadata: true, docDate: true },
  });
  if (!doc) throw new Error("מסמך לא נמצא");

  const meta = parsePayload(doc.metadata);
  if (!meta || meta.kind !== "expense") throw new Error("מסמך לא תקין");

  if (params.paymentLineId) {
    let found = false;
    const payments = (meta.payments ?? []).map((line) => {
      if (line.id !== params.paymentLineId) return line;
      found = true;
      if (line.instrument === "CHECK" && line.check) {
        return { ...line, check: { ...line.check, dueDate: iso } };
      }
      return line;
    });
    if (!found) throw new Error("שורת תשלום לא נמצאה");
    const updated = { ...meta, payments, paymentMethods: payments, returnDate: iso };
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { metadata: updated as object, docDate: due },
    });
  } else {
    const updated = { ...meta, returnDate: iso, docDate: iso };
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { metadata: updated as object, docDate: due },
    });
  }

  await afterForecastMutation();
}

/** שינוי תאריך כניסה עתידית */
export async function changeForecastInflowDate(params: {
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  newDueDate: string;
}): Promise<void> {
  const due = parseDueDate(params.newDueDate);
  if (!due) throw new Error("תאריך לא תקין");
  const iso = due.toISOString().slice(0, 10);

  if (params.sourceType === "check_in") {
    await prisma.checkPayment.update({
      where: { id: params.sourceId },
      data: { dueDate: due },
    });
    await afterForecastMutation();
    return;
  }

  if (params.sourceType === "order_receivable") {
    await prisma.futureOrder.update({
      where: { id: params.sourceId },
      data: { eventDate: due },
    });
    await afterForecastMutation();
    return;
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: params.sourceId },
    select: { id: true, metadata: true },
  });
  if (!doc) throw new Error("מסמך לא נמצא");
  const meta = parsePayload(doc.metadata);
  if (!meta || meta.kind !== "income") throw new Error("מסמך לא תקין");

  if (params.paymentLineId) {
    let found = false;
    const payments = (meta.payments ?? []).map((line) => {
      if (line.id !== params.paymentLineId) return line;
      found = true;
      if (line.instrument === "CHECK" && line.check) {
        return { ...line, check: { ...line.check, dueDate: iso } };
      }
      return line;
    });
    if (!found) throw new Error("שורת תשלום לא נמצאה");
    const updated = { ...meta, payments, paymentMethods: payments, returnDate: iso };
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { metadata: updated as object, docDate: due },
    });
  } else {
    const updated = { ...meta, returnDate: iso, docDate: iso };
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { metadata: updated as object, docDate: due },
    });
  }

  await afterForecastMutation();
}

/** עדכון סכום בשורת תזרים */
export async function updateForecastAmount(params: {
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  newAmount: number;
}): Promise<void> {
  if (!(params.newAmount > 0)) throw new Error("סכום חייב להיות חיובי");

  if (params.sourceType === "check_in") {
    await prisma.checkPayment.update({
      where: { id: params.sourceId },
      data: { amount: params.newAmount },
    });
    await afterForecastMutation();
    return;
  }

  if (params.sourceType === "order_receivable") {
    const order = await prisma.futureOrder.findUnique({ where: { id: params.sourceId } });
    if (!order) throw new Error("הזמנה לא נמצאה");
    const isDeposit = params.paymentLineId === "deposit";
    if (isDeposit) {
      if (params.newAmount > order.totalAmount + 1e-9) throw new Error("הפיקדון גבוה מסכום ההזמנה");
      const remainingAmount = Math.max(0, order.totalAmount - params.newAmount);
      await prisma.futureOrder.update({
        where: { id: params.sourceId },
        data: { depositAmount: params.newAmount, remainingAmount },
      });
    } else {
      await prisma.futureOrder.update({
        where: { id: params.sourceId },
        data: { remainingAmount: params.newAmount },
      });
    }
    await afterForecastMutation();
    return;
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: params.sourceId },
    select: { id: true, metadata: true, category: true },
  });
  if (!doc) throw new Error("מסמך לא נמצא");
  const meta = parsePayload(doc.metadata);
  if (!meta || (meta.kind !== "expense" && meta.kind !== "income")) {
    throw new Error("מסמך לא תקין");
  }

  if (params.paymentLineId) {
    let found = false;
    const payments = (meta.payments ?? []).map((line) => {
      if (line.id !== params.paymentLineId) return line;
      found = true;
      return { ...line, amount: String(params.newAmount) };
    });
    if (!found) throw new Error("שורת תשלום לא נמצאה");
    const updated = { ...meta, payments, paymentMethods: payments };
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { metadata: updated as object },
    });
  } else {
    await prisma.financialDocument.update({
      where: { id: doc.id },
      data: { totalAmount: params.newAmount, remainingAmount: params.newAmount },
    });
  }

  await syncFinancialDocumentPaymentTotals(doc.id);
  await afterForecastMutation();
}

/** סימון הכנסה עתידית כהתקבלה בפועל */
export async function markForecastInflowReceived(params: {
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  amount: number;
}): Promise<void> {
  if (params.sourceType === "check_in") {
    const existing = (await prismaAny.checkPayment.findUnique({
      where: { id: params.sourceId },
    })) as { status: string } | null;
    if (!existing) throw new Error("צ'ק לא נמצא");
    if (existing.status !== "PENDING" && existing.status !== "DEPOSITED") {
      throw new Error("לא ניתן לסמן צ'ק זה כהתקבל");
    }
    const now = new Date();
    await prismaAny.checkPayment.update({
      where: { id: params.sourceId },
      data: {
        status: "CLEARED",
        clearedAt: now,
        depositedAt: existing.status === "DEPOSITED" ? undefined : now,
      },
    });
    await afterForecastMutation();
    return;
  }

  if (params.sourceType === "order_receivable") {
    const isDeposit = params.paymentLineId === "deposit";
    if (isDeposit) {
      await prisma.futureOrder.update({
        where: { id: params.sourceId },
        data: { depositPaid: true },
      });
    } else {
      await prisma.futureOrder.update({
        where: { id: params.sourceId },
        data: { isCompleted: true, status: "COMPLETED", completedAt: new Date(), remainingAmount: 0 },
      });
    }
    await afterForecastMutation();
    return;
  }

  if (params.sourceType !== "customer_receivable") {
    throw new Error("סוג מקור לא נתמך");
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: params.sourceId },
    select: { id: true, customerId: true, totalAmount: true },
  });
  if (!doc?.customerId) throw new Error("מסמך ללא לקוח");

  await prisma.payment.create({
    data: {
      customerId: doc.customerId,
      documentId: doc.id,
      amount: params.amount,
      paymentMethod: "BANK",
      notes: "סומן כהתקבל מתזרים מזומנים",
    },
  });
  await syncFinancialDocumentPaymentTotals(doc.id);
  await afterForecastMutation();
}
