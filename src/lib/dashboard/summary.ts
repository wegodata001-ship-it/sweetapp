import type { ExpenseType } from "@/lib/finance/expense-types";
import { buildCashflowForecast } from "@/lib/finance/cashflow-forecast/build-forecast";
import { formatShekel } from "@/lib/format-shekel";
import { loadDashboardSnapshot, openInvoiceCountFromDocs } from "@/lib/dashboard/snapshot";
import { ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";
import { isDbConnectionError } from "@/lib/prisma-db-health";
import {
  aggregateSupplierPayments,
  runFinancialEngine,
  type DailyPnlPoint,
  type ExpenseCategoryMetrics,
  type SupplierPaymentsMetrics,
  type DashboardHeroMetrics,
  type TodayPnl,
  type ZPosMetrics,
} from "@/lib/dashboard/financial-engine";
import { type RangeKeyed } from "@/lib/dashboard/time-range";
export type DashboardSectionAudit = {
  section: string;
  timeMs: number;
  dbQueries: number;
  rowsRead: number;
};

export type WeddingSectionStats = {
  weddings: number;
  orders: number;
  documented: number;
};

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
  expensesByType: ExpenseCategoryMetrics[];
  zPos: ZPosMetrics;
  zPosByRange: RangeKeyed<ZPosMetrics>;
  weddings: WeddingSectionStats;
  weddingsByRange: RangeKeyed<WeddingSectionStats>;
  dailyChart: DailyPnlPoint[];
  todayPnl: TodayPnl;
  monthPnl: TodayPnl;
  heroMetrics: DashboardHeroMetrics;
  tasksChart: { onTime: number; late: number; early: number };
  supplierPayments: SupplierPaymentsMetrics;
  alerts: DashboardAlert[];
  strip: {
    netProfit: number;
    totalIncome: number;
    totalExpenses: number;
    totalOperations: number;
    newCustomers: number;
    overdueTasks: number;
  };
};

function emptySummary(): DashboardSummary {
  const days = 14;
  const dailyChart = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      income: 0,
      expenses: 0,
      profit: 0,
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    dbUnavailable: true,
    expensesByType: [],
    zPos: { reportsToday: 0, cashToday: 0, cardToday: 0, checksToday: 0, otherToday: 0 },
    zPosByRange: {
      today: { reportsToday: 0, cashToday: 0, cardToday: 0, checksToday: 0, otherToday: 0 },
      week: { reportsToday: 0, cashToday: 0, cardToday: 0, checksToday: 0, otherToday: 0 },
      month: { reportsToday: 0, cashToday: 0, cardToday: 0, checksToday: 0, otherToday: 0 },
    },
    weddings: { weddings: 0, orders: 0, documented: 0 },
    weddingsByRange: {
      today: { weddings: 0, orders: 0, documented: 0 },
      week: { weddings: 0, orders: 0, documented: 0 },
      month: { weddings: 0, orders: 0, documented: 0 },
    },
    dailyChart,
    todayPnl: { income: 0, expenses: 0, profit: 0 },
    monthPnl: { income: 0, expenses: 0, profit: 0 },
    heroMetrics: {
      todayIncomeTotal: 0,
      todayIncomeByMethod: { cash: 0, card: 0, check: 0, other: 0 },
      todayCashIncome: 0,
      todayCashExpenses: 0,
      todayExpenses: 0,
      yesterdayExpenses: 0,
      expenseChangeVsYesterdayPct: null,
      monthIncome: 0,
      monthIncomeByMethod: { cash: 0, card: 0, check: 0, other: 0 },
      monthCashIncome: 0,
      monthCashExpenses: 0,
      monthCashBalance: 0,
      monthExpenses: 0,
      monthProfit: 0,
      weekIncome: 0,
      weekIncomeByMethod: { cash: 0, card: 0, check: 0, other: 0 },
      weekCashIncome: 0,
      weekCashExpenses: 0,
      weekExpenses: 0,
    },
    tasksChart: { onTime: 0, late: 0, early: 0 },
    supplierPayments: {
      paidCount: 0,
      openCount: 0,
      lateCount: 0,
      pendingCount: 0,
      totalPaidAmount: 0,
      openDebtAmount: 0,
      topSuppliers: [],
    },
    alerts: [],
    strip: {
      netProfit: 0,
      totalIncome: 0,
      totalExpenses: 0,
      totalOperations: 0,
      newCustomers: 0,
      overdueTasks: 0,
    },
  };
}

export type DashboardHeroSlice = Pick<
  DashboardSummary,
  "updatedAt" | "dbUnavailable" | "heroMetrics" | "todayPnl" | "monthPnl" | "strip"
>;

/** כרטיס עליון — רק תזרים + מנוע כספי (מהיר יותר מ-summary מלא) */
export async function computeDashboardHeroSlice(locale = "he"): Promise<DashboardHeroSlice> {
  try {
    const snap = await loadDashboardSnapshot();
    const { zToday, zWeek, zMonth } = snap.window;
    const { cashRows, metaByDocId } = snap;

    const engine = runFinancialEngine(cashRows, metaByDocId, locale, {
      today: zToday,
      week: zWeek,
      month: zMonth,
    });

    return {
      updatedAt: new Date().toISOString(),
      dbUnavailable: false,
      heroMetrics: engine.heroMetrics,
      todayPnl: engine.todayPnl,
      monthPnl: {
        income: engine.monthIncome,
        expenses: engine.monthExpenses,
        profit: engine.monthIncome - engine.monthExpenses,
      },
      strip: {
        netProfit: engine.monthIncome - engine.monthExpenses,
        totalIncome: engine.monthIncome,
        totalExpenses: engine.monthExpenses,
        totalOperations: engine.totalOperations,
        newCustomers: 0,
        overdueTasks: 0,
      },
    };
  } catch (e) {
    if (isDbConnectionError(e)) {
      const empty = emptySummary();
      return {
        updatedAt: empty.updatedAt,
        dbUnavailable: empty.dbUnavailable,
        heroMetrics: empty.heroMetrics,
        todayPnl: empty.todayPnl,
        monthPnl: empty.monthPnl,
        strip: empty.strip,
      };
    }
    throw e;
  }
}

export async function computeDashboardSummary(
  locale = "he",
  options?: { audit?: DashboardSectionAudit[] },
): Promise<DashboardSummary> {
  try {
    return await loadSummary(locale, options?.audit);
  } catch (e) {
    if (isDbConnectionError(e)) {
      console.error("[dashboard/summary] database unreachable", e);
      return emptySummary();
    }
    throw e;
  }
}

async function timedSection<T>(
  audit: DashboardSectionAudit[] | undefined,
  section: string,
  dbQueries: number,
  load: () => Promise<{ value: T; rowsRead: number }>,
): Promise<T> {
  const started = performance.now();
  const { value, rowsRead } = await load();
  audit?.push({
    section,
    timeMs: Math.round(performance.now() - started),
    dbQueries,
    rowsRead,
  });
  return value;
}

async function loadSummary(locale: string, audit?: DashboardSectionAudit[]): Promise<DashboardSummary> {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);

  const snap = await timedSection(audit, "SNAPSHOT", 1, async () => {
    const value = await loadDashboardSnapshot();
    return {
      value,
      rowsRead:
        value.cashRows.length +
        value.incomeDocs.length +
        value.expenseDocs.length +
        value.alertOrders.length +
        value.employeeTasksToday.length,
    };
  });
  const cashflowForecast = await timedSection(audit, "OTHER", 0, async () => {
    const value = await buildCashflowForecast().catch(() => null);
    return { value, rowsRead: value?.rows.length ?? 0 };
  });

  const { zToday, zWeek, zMonth, weddingToday, weddingWeek, weddingMonth } = snap.window;
  const { cashRows, metaByDocId } = snap;
  const newCustomers = snap.newCustomers;
  const notifyWidgets = snap.notifyWidgets;
  const shortageCount = snap.shortageCount;
  const alertOrders = snap.alertOrders;
  const employeeTasksToday = snap.employeeTasksToday;
  const supplierExpenseDocs = snap.expenseDocs.map((row) => ({
    id: row.id,
    totalAmount: row.totalAmount,
    depositAmount: row.depositAmount,
    paidAmount: row.paidAmount,
    paymentStatus: row.paymentStatus,
    metadata: row.metadata,
    docDate: row.docDate,
    supplierId: row.supplierId,
    supplierName: row.supplierId ? (row.supplier?.name ?? null) : null,
  }));
  const openInvoices = openInvoiceCountFromDocs(snap.incomeDocs);
  if (audit) {
    audit.push(
      { section: "AUTH", timeMs: 0, dbQueries: 0, rowsRead: 0 },
      { section: "CASH", timeMs: 0, dbQueries: 0, rowsRead: snap.cashRows.length },
      { section: "INCOME", timeMs: 0, dbQueries: 0, rowsRead: snap.incomeDocs.length },
      { section: "EXPENSES", timeMs: 0, dbQueries: 0, rowsRead: snap.expenseDocs.length },
      { section: "Z REPORTS", timeMs: 0, dbQueries: 0, rowsRead: 1 },
      { section: "CUSTOMER DEBTS", timeMs: 0, dbQueries: 0, rowsRead: openInvoices },
      { section: "SUPPLIER PAYABLES", timeMs: 0, dbQueries: 0, rowsRead: supplierExpenseDocs.length },
      { section: "ORDERS", timeMs: 0, dbQueries: 0, rowsRead: alertOrders.length },
      { section: "EMPLOYEE COSTS", timeMs: 0, dbQueries: 0, rowsRead: employeeTasksToday.length },
    );
  }

  const engine = runFinancialEngine(cashRows, metaByDocId, locale, {
    today: zToday,
    week: zWeek,
    month: zMonth,
  });
  engine.newCustomers = newCustomers;

  const supplierPayments = aggregateSupplierPayments(supplierExpenseDocs, today0);

  const weddingsByRange: RangeKeyed<WeddingSectionStats> = {
    today: weddingToday,
    week: weddingWeek,
    month: weddingMonth,
  };
  const weddings = weddingsByRange.today;

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

  const alerts: DashboardAlert[] = [];
  const push = (a: DashboardAlert) => {
    if (alerts.length < 28) alerts.push(a);
  };

  if (notifyWidgets.overdueTasks > 0) {
    push({
      id: "overdue-task-groups",
      severity: "warning",
      titleKey: "dashboard.redesign.alertTasksOverdue",
      detail: String(notifyWidgets.overdueTasks),
      href: "/admin/tasks",
      titleParams: { count: notifyWidgets.overdueTasks },
    });
  }
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

  if (cashflowForecast) {
    for (const s of cashflowForecast.shortages.slice(0, 5)) {
      const [y, m, d] = s.date.split("-");
      const dateLabel = y && m && d ? `${d}/${m}/${y}` : s.date;
      push({
        id: `cashflow-shortage-${s.id}`,
        severity: "critical",
        titleKey: "cashflowForecast.alertShortageTitle",
        detail: `${dateLabel} · ${formatShekel(s.shortageAmount)}`,
        href: "/finance/cashflow-forecast",
        titleParams: { date: dateLabel, amount: formatShekel(s.shortageAmount) },
      });
    }
  }

  if (shortageCount > 0) {
    push({
      id: "inventory-shortage",
      severity: "critical",
      titleKey: "dashboard.shortageTitle",
      detail: `${shortageCount}`,
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

  for (const o of alertOrders) {
    const ed = new Date(o.eventDate);
    ed.setHours(0, 0, 0, 0);
    const days = Math.round((ed.getTime() - today0.getTime()) / 86400000);
    const isWedding = o.orderCategory === ORDER_CATEGORY_WEDDING;
    if (!isWedding) continue;

    if (days >= 0 && days <= 7) {
      push({
        id: `wedding-soon-${o.id}`,
        severity: "wedding",
        titleKey: "dashboard.redesign.alertWeddingEventSoon",
        detail: `${o.customerName} · #${o.orderNumber}`,
        href: "/admin/wedding-orders",
      });
    }
    if ((o.remainingAmount ?? 0) > 1e-6) {
      push({
        id: `wedding-pay-${o.id}`,
        severity: "wedding",
        titleKey: "dashboard.redesign.alertWeddingMissingPay",
        detail: `${o.customerName} · #${o.orderNumber}`,
        href: "/admin/wedding-orders",
      });
    }
    if ((o.depositAmount ?? 0) < 1e-6 && !o.depositPaid) {
      push({
        id: `wedding-dep-${o.id}`,
        severity: "wedding",
        titleKey: "dashboard.redesign.alertWeddingNoApproval",
        detail: `${o.customerName} · #${o.orderNumber}`,
        href: "/admin/wedding-orders",
      });
    }
  }

  for (const o of alertOrders) {
    if (o.orderCategory === ORDER_CATEGORY_WEDDING) continue;
    const days = Math.round((new Date(o.eventDate).getTime() - today0.getTime()) / 86400000);
    if (days >= 0 && days <= 3) {
      push({
        id: `order-soon-${o.id}`,
        severity: "warning",
        titleKey: "dashboard.redesign.alertOrderSoon",
        detail: `${o.customerName} · #${o.orderNumber}`,
        href: "/admin/daily-orders",
      });
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    dbUnavailable: false,
    expensesByType: engine.expensesByType,
    zPos: engine.zPos,
    zPosByRange: engine.zPosByRange,
    weddings,
    weddingsByRange,
    dailyChart: engine.dailyChart,
    todayPnl: engine.todayPnl,
    heroMetrics: engine.heroMetrics,
    monthPnl: {
      income: engine.monthIncome,
      expenses: engine.monthExpenses,
      profit: engine.monthIncome - engine.monthExpenses,
    },
    tasksChart: { onTime: tasksOnTime, late: tasksLate, early: tasksEarly },
    supplierPayments,
    alerts,
    strip: {
      netProfit: engine.monthIncome - engine.monthExpenses,
      totalIncome: engine.monthIncome,
      totalExpenses: engine.monthExpenses,
      totalOperations: engine.totalOperations,
      newCustomers: engine.newCustomers,
      overdueTasks: notifyWidgets.overdueTasks,
    },
  };
}
