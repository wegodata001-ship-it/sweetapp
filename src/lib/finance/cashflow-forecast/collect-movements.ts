import { prisma } from "@/lib/prisma";
import { OPEN_CHECK_STATUSES } from "@/lib/checks/types";
import {
  parsePayload,
  type IncomeExpensePayload,
  type PaymentLinePayload,
} from "@/lib/finance/document-payload";
import { isOpenInvoiceDoc } from "@/lib/finance/open-invoices";
import {
  normalizeExpenseType,
  type ExpenseType,
} from "@/lib/finance/expense-types";
import { parseNum } from "@/lib/format-shekel";
import { parseDateKey, toDateKey } from "@/lib/finance/cashflow-forecast/date-utils";
import { listManualForecastEntries } from "@/lib/finance/cashflow-forecast/forecast-manual-entries";
import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";

export type ForecastMovement = {
  id: string;
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  orderCategory?: string | null;
  dueDate: string;
  description: string;
  inflow: number;
  outflow: number;
  canDefer: boolean;
};

const EXPENSE_OUTFLOW_LABEL: Record<ExpenseType, string> = {
  SUPPLIER_PAYMENTS: "תשלום ספק",
  WORKER_PAYMENTS: "תשלום עובד",
  DAILY_PAYMENTS: "תשלום שוטף",
  EXTERNAL_PAYMENTS: "הוצאה חיצונית",
  INVESTMENTS: "השקעה",
};

const INSTRUMENT_LABEL: Record<string, string> = {
  CHECK: "צ'ק",
  BANK: "העברה בנקאית",
  CASH: "מזומן",
  CREDIT: "אשראי",
  BIT: "ביט",
};

function expenseSourceType(expenseType: ExpenseType): ForecastSourceType {
  if (expenseType === "WORKER_PAYMENTS") return "employee_pay";
  if (expenseType === "INVESTMENTS") return "investment";
  if (expenseType === "EXTERNAL_PAYMENTS") return "external_expense";
  return "expense_out";
}

function resolveDueDate(
  meta: IncomeExpensePayload | null,
  line: PaymentLinePayload | null,
  docDate: Date | null,
  fallback: string,
): string {
  if (line?.instrument === "CHECK" && line.check?.dueDate?.trim()) {
    const d = parseDateKey(line.check.dueDate);
    if (d) return d;
  }
  if (meta?.returnDate?.trim()) {
    const d = parseDateKey(meta.returnDate);
    if (d) return d;
  }
  if (meta?.docDate?.trim()) {
    const d = parseDateKey(meta.docDate);
    if (d) return d;
  }
  if (docDate) return toDateKey(docDate);
  return fallback;
}

function pushMovement(
  movements: ForecastMovement[],
  row: ForecastMovement,
): void {
  if (row.inflow <= 0 && row.outflow <= 0) return;
  movements.push(row);
}

/** איסוף כל התנועות העתידיות לפי תאריך פירעון / ביצוע */
export async function collectForecastMovements(fallbackDate: string): Promise<ForecastMovement[]> {
  const movements: ForecastMovement[] = [];
  const checkAmountByDoc = new Map<string, number>();

  const checks = await prisma.checkPayment.findMany({
    where: { status: { in: [...OPEN_CHECK_STATUSES] } },
    include: {
      customer: { select: { name: true } },
      document: { select: { id: true, title: true } },
    },
  });

  for (const c of checks) {
    const dueDate = toDateKey(c.dueDate);
    const cust = c.customer?.name?.trim() || "לקוח";
    if (c.documentId) {
      checkAmountByDoc.set(
        c.documentId,
        (checkAmountByDoc.get(c.documentId) ?? 0) + c.amount,
      );
    }
    pushMovement(movements, {
      id: `check-in-${c.id}`,
      sourceType: "check_in",
      sourceId: c.id,
      dueDate,
      description: `צ'ק נכנס — ${cust}${c.checkNumber ? ` #${c.checkNumber}` : ""}`,
      inflow: c.amount,
      outflow: 0,
      canDefer: false,
    });
  }

  const incomeDocs = await prisma.financialDocument.findMany({
    where: { category: "הכנסה" },
    select: {
      id: true,
      title: true,
      paymentStatus: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      docDate: true,
      metadata: true,
      customer: { select: { name: true } },
    },
  });

  for (const doc of incomeDocs) {
    if (!isOpenInvoiceDoc(doc)) continue;
    let remaining =
      doc.remainingAmount > 0.01
        ? doc.remainingAmount
        : Math.max(0, doc.totalAmount - doc.paidAmount);
    if (remaining <= 0.01) continue;

    const coveredByChecks = checkAmountByDoc.get(doc.id) ?? 0;
    remaining = Math.max(0, remaining - coveredByChecks);
    if (remaining <= 0.01) continue;

    const meta = parsePayload(doc.metadata);
    const incomeMeta = meta?.kind === "income" ? meta : null;
    const name =
      doc.customer?.name?.trim() || incomeMeta?.counterpartyName?.trim() || doc.title;
    const payments = incomeMeta?.payments ?? [];

    let scheduled = 0;
    for (const line of payments) {
      const amt = parseNum(line.amount);
      if (amt <= 0) continue;
      const use = Math.min(amt, remaining - scheduled);
      if (use <= 0) break;
      const dueDate = resolveDueDate(incomeMeta, line, doc.docDate, fallbackDate);
      const instrument = INSTRUMENT_LABEL[line.instrument] ?? line.instrument;
      pushMovement(movements, {
        id: `in-${doc.id}-${line.id}`,
        sourceType: "customer_receivable",
        sourceId: doc.id,
        paymentLineId: line.id,
        dueDate,
        description: `תשלום לקוח — ${name} (${instrument})`,
        inflow: use,
        outflow: 0,
        canDefer: false,
      });
      scheduled += use;
    }

    const leftover = remaining - scheduled;
    if (leftover > 0.01) {
      const dueDate = resolveDueDate(incomeMeta, null, doc.docDate, fallbackDate);
      pushMovement(movements, {
        id: `recv-${doc.id}`,
        sourceType: "customer_receivable",
        sourceId: doc.id,
        dueDate,
        description: `חשבונית פתוחה — ${name}`,
        inflow: leftover,
        outflow: 0,
        canDefer: false,
      });
    }
  }

  const orders = await prisma.futureOrder.findMany({
    where: {
      isCompleted: false,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      remainingAmount: { gt: 0.01 },
    },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      remainingAmount: true,
      depositAmount: true,
      depositPaid: true,
      eventDate: true,
      orderCategory: true,
    },
  });

  for (const o of orders) {
    const eventDate = toDateKey(o.eventDate);
    if (!o.depositPaid && o.depositAmount > 0.01) {
      pushMovement(movements, {
        id: `order-dep-${o.id}`,
        sourceType: "order_receivable",
        sourceId: o.id,
        paymentLineId: "deposit",
        orderCategory: o.orderCategory,
        dueDate: eventDate,
        description: `מקדמה — ${o.customerName} (#${o.orderNumber})`,
        inflow: o.depositAmount,
        outflow: 0,
        canDefer: false,
      });
    }
    if (o.remainingAmount > 0.01) {
      pushMovement(movements, {
        id: `order-${o.id}`,
        sourceType: "order_receivable",
        sourceId: o.id,
        orderCategory: o.orderCategory,
        dueDate: eventDate,
        description: `תשלום הזמנה — ${o.customerName} (#${o.orderNumber})`,
        inflow: o.remainingAmount,
        outflow: 0,
        canDefer: false,
      });
    }
  }

  const expenseDocs = await prisma.financialDocument.findMany({
    where: { category: "הוצאה" },
    select: {
      id: true,
      title: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      docDate: true,
      metadata: true,
      supplier: { select: { name: true } },
      employee: { select: { name: true } },
    },
  });

  for (const doc of expenseDocs) {
    const remaining =
      doc.remainingAmount > 0.01
        ? doc.remainingAmount
        : Math.max(0, doc.totalAmount - doc.paidAmount);
    if (remaining <= 0.01) continue;

    const meta = parsePayload(doc.metadata);
    if (!meta || meta.kind !== "expense") {
      const dueDate = doc.docDate ? toDateKey(doc.docDate) : fallbackDate;
      pushMovement(movements, {
        id: `exp-fallback-${doc.id}`,
        sourceType: "expense_out",
        sourceId: doc.id,
        dueDate,
        description: `הוצאה פתוחה — ${doc.title}`,
        inflow: 0,
        outflow: remaining,
        canDefer: true,
      });
      continue;
    }

    const expenseType = normalizeExpenseType(meta.expenseType);
    const sourceType = expenseSourceType(expenseType);
    const baseLabel = EXPENSE_OUTFLOW_LABEL[expenseType];
    const party =
      doc.supplier?.name?.trim() ||
      doc.employee?.name?.trim() ||
      meta.counterpartyName?.trim() ||
      doc.title;

    let scheduled = 0;
    for (const line of meta.payments ?? []) {
      const amt = parseNum(line.amount);
      if (amt <= 0) continue;
      const use = Math.min(amt, remaining - scheduled);
      if (use <= 0) break;

      const dueDate = resolveDueDate(meta, line, doc.docDate, fallbackDate);
      const instrument = INSTRUMENT_LABEL[line.instrument] ?? line.instrument;
      const isCheck = line.instrument === "CHECK";

      pushMovement(movements, {
        id: `exp-${doc.id}-${line.id}`,
        sourceType: isCheck ? "supplier_check" : sourceType,
        sourceId: doc.id,
        paymentLineId: line.id,
        dueDate,
        description: `${baseLabel} — ${party} (${instrument})`,
        inflow: 0,
        outflow: use,
        canDefer: true,
      });
      scheduled += use;
    }

    const leftover = remaining - scheduled;
    if (leftover > 0.01) {
      const dueDate = resolveDueDate(meta, null, doc.docDate, fallbackDate);
      pushMovement(movements, {
        id: `exp-rem-${doc.id}`,
        sourceType,
        sourceId: doc.id,
        dueDate,
        description: `${baseLabel} — ${party}`,
        inflow: 0,
        outflow: leftover,
        canDefer: true,
      });
    }
  }

  const manualEntries = await listManualForecastEntries();
  for (const entry of manualEntries) {
    pushMovement(movements, {
      id: `manual-${entry.id}`,
      sourceType: "manual_income",
      sourceId: entry.id,
      dueDate: entry.dueDate,
      description:
        entry.entryType === "loan" ? `הלוואה — ${entry.description}` : entry.description,
      inflow: entry.amount,
      outflow: 0,
      canDefer: false,
    });
  }

  movements.sort((a, b) => {
    const cmp = a.dueDate.localeCompare(b.dueDate);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  return movements;
}
