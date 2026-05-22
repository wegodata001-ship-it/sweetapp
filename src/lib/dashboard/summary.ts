import { prisma } from "@/lib/prisma";
import {
  EXPENSE_TYPE_VALUES,
  normalizeExpenseType,
  type ExpenseType,
} from "@/lib/finance/expense-types";
import { getAdminNotificationWidgets } from "@/lib/notifications/admin-widgets";
import { countOpenInvoices } from "@/lib/finance/open-invoices";
import { isSystemCleanMode } from "@/lib/system/clean-mode";
import { ORDER_CATEGORY_DAILY, ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";
import { isDbConnectionError } from "@/lib/prisma-db-health";

export type ExpenseCategoryKey = ExpenseType;

export type DashboardAlert = {
  id: string;
  severity: "critical" | "warning" | "success" | "wedding";
  titleKey: string;
  detail: string;
  href?: string;
  titleParams?: Record<string, string | number>;
};

export type DashboardSummary = {
  updatedAt: string;
  dbUnavailable: boolean;
  month: {
    income: number;
    expenses: number;
    profit: number;
    prevIncome: number;
    prevExpenses: number;
  };
  strip: {
    netProfit: number;
    totalIncome: number;
    totalExpenses: number;
    totalOperations: number;
    newCustomers: number;
    overdueTasks: number;
  };
  expensesByType: Array<{
    type: ExpenseCategoryKey;
    total: number;
    changePct: number | null;
    sparkline: number[];
  }>;
  zCash: {
    totalToday: number;
    cash: number;
    card: number;
    checks: number;
  };
  weddings: {
    weddings: number;
    orders: number;
    documented: number;
  };
  dailyChart: Array<{
    date: string;
    label: string;
    income: number;
    expenses: number;
    profit: number;
  }>;
  tasksChart: { onTime: number; late: number; early: number };
  supplierChart: { paid: number; open: number; late: number; pending: number };
  alerts: DashboardAlert[];
  notifyWidgets: {
    lateEmployees: number;
    overdueTasks: number;
    pendingChecks: number;
    upcomingOrders: number;
  };
};

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0);
}

function monthEnd(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function pctChange(current: number, previous: number): number | null {
  if (previous < 1) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function zPaymentBucket(method: string | null | undefined): "cash" | "card" | "check" | "other" {
  const k = (method ?? "").toLowerCase();
  if (/check|שיק|cheque/.test(k)) return "check";
  if (/credit|card|אשראי|visa|master/.test(k)) return "card";
  if (/cash|מזומן|cash_register/.test(k)) return "cash";
  return "other";
}

function isZEntry(row: { source: string | null; zReportId: string | null }) {
  return Boolean(row.zReportId?.trim() || row.source === "z_report");
}

function cashflowAmounts(entryType: string, amount: number) {
  const t = entryType.toLowerCase();
  const raw = Number(amount);
  let inflow = 0;
  let outflow = 0;
  if (Number.isFinite(raw)) {
    if (t === "income" || t === "deposit") inflow = raw >= 0 ? raw : 0;
    else if (["expense", "refund", "supplier_payment", "salary", "deposit_refund"].includes(t))
      outflow = raw >= 0 ? raw : -raw;
  }
  return { inflow, outflow };
}

function emptySummary(): DashboardSummary {
  const days = 14;
  const dailyChart = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: dayKey(d),
      label: String(d.getDate()),
      income: 0,
      expenses: 0,
      profit: 0,
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    dbUnavailable: true,
    month: { income: 0, expenses: 0, profit: 0, prevIncome: 0, prevExpenses: 0 },
    strip: {
      netProfit: 0,
      totalIncome: 0,
      totalExpenses: 0,
      totalOperations: 0,
      newCustomers: 0,
      overdueTasks: 0,
    },
    expensesByType: EXPENSE_TYPE_VALUES.map((type) => ({
      type,
      total: 0,
      changePct: null,
      sparkline: Array(7).fill(0),
    })),
    zCash: { totalToday: 0, cash: 0, card: 0, checks: 0 },
    weddings: { weddings: 0, orders: 0, documented: 0 },
    dailyChart,
    tasksChart: { onTime: 0, late: 0, early: 0 },
    supplierChart: { paid: 0, open: 0, late: 0, pending: 0 },
    alerts: [],
    notifyWidgets: {
      lateEmployees: 0,
      overdueTasks: 0,
      pendingChecks: 0,
      upcomingOrders: 0,
    },
  };
}

export async function computeDashboardSummary(locale = "he"): Promise<DashboardSummary> {
  try {
    return await loadSummary(locale);
  } catch (e) {
    if (isDbConnectionError(e)) {
      console.error("[dashboard/summary] database unreachable", e);
      return emptySummary();
    }
    throw e;
  }
}

async function loadSummary(locale: string): Promise<DashboardSummary> {
  const nowStart = monthStart(0);
  const nowEnd = monthEnd(0);
  const prevStart = monthStart(-1);
  const prevEnd = monthEnd(-1);
  const chartFrom = new Date();
  chartFrom.setDate(chartFrom.getDate() - 13);
  chartFrom.setHours(0, 0, 0, 0);
  const fetchFrom = new Date(Math.min(chartFrom.getTime(), prevStart.getTime()));

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);

  const [
    cashRows,
    futureOrders,
    employeeTasksToday,
    supplierExpenseDocs,
    newCustomers,
    openInvoices,
    inventoryProducts,
    notifyWidgets,
    documentedDocs,
  ] = await Promise.all([
    prisma.cashFlowEntry.findMany({
      where: { entryDate: { gte: fetchFrom } },
      select: {
        id: true,
        entryType: true,
        amount: true,
        entryDate: true,
        paymentMethod: true,
        source: true,
        zReportId: true,
        expenseType: true,
        documentId: true,
      },
    }),
    prisma.futureOrder.findMany({
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        orderCategory: true,
        eventDate: true,
        depositAmount: true,
        depositPaid: true,
        remainingAmount: true,
        status: true,
        isCompleted: true,
      },
    }),
    prisma.employeeTask.findMany({
      where: {
        OR: [
          { completedAt: { gte: today0, lte: todayEnd } },
          {
            status: { in: ["PENDING", "IN_PROGRESS"] },
            targetDueAt: { lte: todayEnd },
          },
        ],
      },
      select: { status: true, targetDueAt: true, completedAt: true },
    }),
    prisma.financialDocument.findMany({
      where: { category: "הוצאה" },
      select: {
        id: true,
        totalAmount: true,
        depositAmount: true,
        paymentStatus: true,
        metadata: true,
        docDate: true,
        createdAt: true,
      },
    }),
    prisma.customer.count({ where: { createdAt: { gte: nowStart, lte: nowEnd } } }),
    countOpenInvoices({ log: false }),
    prisma.inventoryProduct.findMany({
      select: {
        name: true,
        counts: { orderBy: { countDate: "desc" }, take: 1, select: { difference: true } },
      },
    }),
    isSystemCleanMode()
      ? Promise.resolve({ lateEmployees: 0, overdueTasks: 0, pendingChecks: 0, upcomingOrders: 0 })
      : getAdminNotificationWidgets().catch(() => ({
          lateEmployees: 0,
          overdueTasks: 0,
          pendingChecks: 0,
          upcomingOrders: 0,
        })),
    prisma.financialDocument.count({
      where: { category: "הכנסה", sentToCpa: true },
    }),
  ]);

  const docIdsNeedingType = cashRows
    .filter((r) => !r.expenseType && r.documentId)
    .map((r) => r.documentId as string);
  const metaByDocId = new Map<string, ExpenseType>();
  if (docIdsNeedingType.length > 0) {
    const uniq = [...new Set(docIdsNeedingType)];
    const docs = await prisma.financialDocument.findMany({
      where: { id: { in: uniq } },
      select: { id: true, metadata: true },
    });
    for (const d of docs) {
      const meta = d.metadata as { expenseType?: unknown } | null;
      metaByDocId.set(d.id, normalizeExpenseType(meta?.expenseType));
    }
  }

  let monthIncome = 0;
  let monthExpenses = 0;
  let prevIncome = 0;
  let prevExpenses = 0;
  let totalOperations = 0;

  const expenseCurrent = new Map<ExpenseType, number>();
  const expensePrev = new Map<ExpenseType, number>();
  const expenseDaily = new Map<string, Map<ExpenseType, number>>();
  for (const t of EXPENSE_TYPE_VALUES) {
    expenseCurrent.set(t, 0);
    expensePrev.set(t, 0);
  }

  const dailyMap = new Map<string, { income: number; expenses: number }>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(chartFrom);
    d.setDate(chartFrom.getDate() + i);
    dailyMap.set(dayKey(d), { income: 0, expenses: 0 });
  }

  let zTotalToday = 0;
  let zCash = 0;
  let zCard = 0;
  let zChecks = 0;

  for (const raw of cashRows) {
    const row = cashflowAmounts(raw.entryType, raw.amount);
    const ed = new Date(raw.entryDate);
    const inMonth = inRange(ed, nowStart, nowEnd);
    const inPrev = inRange(ed, prevStart, prevEnd);
    if (inMonth || inPrev) totalOperations += 1;

    if (inMonth) {
      monthIncome += row.inflow;
      monthExpenses += row.outflow;
    } else if (inPrev) {
      prevIncome += row.inflow;
      prevExpenses += row.outflow;
    }

    const dk = dayKey(ed);
    const dayAgg = dailyMap.get(dk);
    if (dayAgg) {
      dayAgg.income += row.inflow;
      dayAgg.expenses += row.outflow;
    }

    if (row.outflow > 0 && (inMonth || inPrev)) {
      const et =
        (raw.expenseType as ExpenseType | null) ??
        (raw.documentId ? metaByDocId.get(raw.documentId) : undefined) ??
        "SUPPLIER_PAYMENTS";
      const type = normalizeExpenseType(et);
      if (inMonth) expenseCurrent.set(type, (expenseCurrent.get(type) ?? 0) + row.outflow);
      if (inPrev) expensePrev.set(type, (expensePrev.get(type) ?? 0) + row.outflow);
      if (inMonth) {
        const sparkDay = new Date(ed);
        sparkDay.setHours(0, 0, 0, 0);
        const sk = dayKey(sparkDay);
        if (!expenseDaily.has(sk)) expenseDaily.set(sk, new Map());
        const m = expenseDaily.get(sk)!;
        m.set(type, (m.get(type) ?? 0) + row.outflow);
      }
    }

    if (isZEntry(raw) && inRange(ed, today0, todayEnd) && row.inflow > 0) {
      zTotalToday += row.inflow;
      const bucket = zPaymentBucket(raw.paymentMethod);
      if (bucket === "cash") zCash += row.inflow;
      else if (bucket === "card") zCard += row.inflow;
      else if (bucket === "check") zChecks += row.inflow;
      else zCash += row.inflow;
    }
  }

  const sparkDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    sparkDays.push(dayKey(d));
  }

  const expensesByType = EXPENSE_TYPE_VALUES.map((type) => {
    const total = expenseCurrent.get(type) ?? 0;
    const prev = expensePrev.get(type) ?? 0;
    const sparkline = sparkDays.map((sk) => expenseDaily.get(sk)?.get(type) ?? 0);
    return { type, total, changePct: pctChange(total, prev), sparkline };
  });

  const bcp = locale === "ar" ? "ar-IL" : locale === "en" ? "en-IL" : "he-IL";
  const dailyChart = [...dailyMap.entries()].map(([date, v]) => {
    const d = new Date(date + "T12:00:00");
    return {
      date,
      label: d.toLocaleDateString(bcp, { weekday: "short", day: "numeric" }),
      income: v.income,
      expenses: v.expenses,
      profit: v.income - v.expenses,
    };
  });

  const activeOrder = (o: (typeof futureOrders)[number]) =>
    !o.isCompleted && o.status !== "COMPLETED" && o.status !== "CANCELLED";

  const weddings = {
    weddings: futureOrders.filter((o) => o.orderCategory === ORDER_CATEGORY_WEDDING && activeOrder(o)).length,
    orders: futureOrders.filter((o) => o.orderCategory === ORDER_CATEGORY_DAILY && activeOrder(o)).length,
    documented: documentedDocs,
  };

  const nowMs = Date.now();
  let tasksOnTime = 0;
  let tasksLate = 0;
  let tasksEarly = 0;
  for (const task of employeeTasksToday) {
    const due = task.targetDueAt?.getTime() ?? null;
    if (task.status === "COMPLETED" && task.completedAt) {
      const done = task.completedAt.getTime();
      if (due == null) {
        tasksOnTime += 1;
        continue;
      }
      if (done < due - 5 * 60 * 1000) tasksEarly += 1;
      else if (done <= due) tasksOnTime += 1;
      else tasksLate += 1;
    } else if (task.status !== "COMPLETED") {
      if (due != null && due < nowMs) tasksLate += 1;
      else tasksOnTime += 1;
    }
  }

  const supplierChart = { paid: 0, open: 0, late: 0, pending: 0 };
  const todayMs = today0.getTime();
  for (const doc of supplierExpenseDocs) {
    const meta = doc.metadata as { expenseType?: unknown } | null;
    if (normalizeExpenseType(meta?.expenseType) !== "SUPPLIER_PAYMENTS") continue;
    const net = Math.max(0, doc.totalAmount - (doc.depositAmount ?? 0));
    if (net < 0.01) continue;
    const status = (doc.paymentStatus ?? "unpaid").toLowerCase();
    const due = doc.docDate ? new Date(doc.docDate).getTime() : null;
    if (status === "paid") supplierChart.paid += 1;
    else if (status === "partial") supplierChart.pending += 1;
    else if (due != null && due < todayMs) supplierChart.late += 1;
    else supplierChart.open += 1;
  }

  const alerts: DashboardAlert[] = [];
  const push = (a: DashboardAlert) => {
    if (alerts.length < 24) alerts.push(a);
  };

  if (notifyWidgets.lateEmployees > 0) {
    push({
      id: "late-employees",
      severity: "critical",
      titleKey: "dashboard.widgetLateEmployees",
      detail: String(notifyWidgets.lateEmployees),
      href: "/admin/staff",
      titleParams: { count: notifyWidgets.lateEmployees },
    });
  }
  if (notifyWidgets.overdueTasks > 0) {
    push({
      id: "overdue-task-groups",
      severity: "warning",
      titleKey: "dashboard.widgetOverdueTasks",
      detail: String(notifyWidgets.overdueTasks),
      href: "/admin/tasks",
      titleParams: { count: notifyWidgets.overdueTasks },
    });
  }
  if (notifyWidgets.pendingChecks > 0) {
    push({
      id: "pending-checks",
      severity: "warning",
      titleKey: "dashboard.widgetPendingChecks",
      detail: String(notifyWidgets.pendingChecks),
      href: "/finance/checks",
      titleParams: { count: notifyWidgets.pendingChecks },
    });
  }
  if (notifyWidgets.upcomingOrders > 0) {
    push({
      id: "upcoming-orders",
      severity: "wedding",
      titleKey: "dashboard.widgetUpcomingOrders",
      detail: String(notifyWidgets.upcomingOrders),
      href: "/admin/future-orders",
      titleParams: { count: notifyWidgets.upcomingOrders },
    });
  }

  const shortageRows = inventoryProducts
    .map((item) => ({ name: item.name, diff: item.counts[0]?.difference ?? 0 }))
    .filter((item) => item.diff < 0)
    .sort((a, b) => a.diff - b.diff);

  if (shortageRows.length > 0) {
    push({
      id: "inventory-shortage",
      severity: "critical",
      titleKey: "dashboard.shortageTitle",
      detail: `${shortageRows.length}`,
      href: "/ops/inventory",
    });
  } else {
    push({
      id: "inventory-ok",
      severity: "success",
      titleKey: "dashboard.shortageTitle",
      detail: "ok",
      href: "/ops/inventory",
    });
  }

  if (openInvoices > 0) {
    push({
      id: "open-invoices",
      severity: "warning",
      titleKey: "dashboard.openInvoicesTitle",
      detail: String(openInvoices),
      href: "/finance/ledgers",
      titleParams: { count: openInvoices },
    });
  }

  const today = new Date();
  for (const o of futureOrders) {
    if (!activeOrder(o)) continue;
    const ed = new Date(o.eventDate);
    ed.setHours(0, 0, 0, 0);
    const days = Math.round((ed.getTime() - today0.getTime()) / 86400000);
    const isWedding = o.orderCategory === ORDER_CATEGORY_WEDDING;
    if (days >= 0 && days <= 3) {
      push({
        id: `soon-${o.id}`,
        severity: isWedding ? "wedding" : "warning",
        titleKey: isWedding ? "dashboard.redesign.alertWeddingSoon" : "dashboard.alertKindSoon",
        detail: `${o.customerName} #${o.orderNumber}`,
        href: isWedding ? "/admin/wedding-orders" : "/admin/daily-orders",
      });
    }
    if ((o.depositAmount ?? 0) < 1e-6 && !o.depositPaid) {
      push({
        id: `nodep-${o.id}`,
        severity: isWedding ? "wedding" : "warning",
        titleKey: isWedding ? "dashboard.redesign.alertWeddingNoDeposit" : "dashboard.alertKindNoDeposit",
        detail: `${o.customerName} #${o.orderNumber}`,
        href: isWedding ? "/admin/wedding-orders" : "/admin/daily-orders",
      });
    }
    if ((o.remainingAmount ?? 0) > 1e-6) {
      push({
        id: `balance-${o.id}`,
        severity: isWedding ? "wedding" : "warning",
        titleKey: "dashboard.redesign.alertMissingPayment",
        detail: `${o.customerName} #${o.orderNumber}`,
        href: isWedding ? "/admin/wedding-orders" : "/admin/daily-orders",
      });
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    dbUnavailable: false,
    month: {
      income: monthIncome,
      expenses: monthExpenses,
      profit: monthIncome - monthExpenses,
      prevIncome,
      prevExpenses,
    },
    strip: {
      netProfit: monthIncome - monthExpenses,
      totalIncome: monthIncome,
      totalExpenses: monthExpenses,
      totalOperations,
      newCustomers,
      overdueTasks: notifyWidgets.overdueTasks,
    },
    expensesByType,
    zCash: { totalToday: zTotalToday, cash: zCash, card: zCard, checks: zChecks },
    weddings,
    dailyChart,
    tasksChart: { onTime: tasksOnTime, late: tasksLate, early: tasksEarly },
    supplierChart,
    alerts,
    notifyWidgets,
  };
}
