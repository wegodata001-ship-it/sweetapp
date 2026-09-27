import { prisma } from "@/lib/prisma";
import { normalizeExpenseType, type ExpenseType } from "@/lib/finance/expense-types";
import { getAdminNotificationWidgets } from "@/lib/notifications/admin-widgets";
import { buildCashflowForecast } from "@/lib/finance/cashflow-forecast/build-forecast";
import { formatShekel } from "@/lib/format-shekel";
import { countOpenInvoices } from "@/lib/finance/open-invoices";
import { loadSharedExpenseDocuments } from "@/lib/finance/shared-forecast-reads";
import { isSystemCleanMode } from "@/lib/system/clean-mode";
import { ORDER_CATEGORY_DAILY, ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";
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
import { boundsForDashboardRange, type RangeKeyed } from "@/lib/dashboard/time-range";
import { LATEST_COUNT_ORDER_BY } from "@/lib/inventory/count-latest";
import { ACTIVE_COUNT_LINE_WHERE } from "@/lib/inventory/count-session-status";

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

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0);
}

type DashboardWindowCounts = {
  zToday: number;
  zWeek: number;
  zMonth: number;
  weddingToday: WeddingSectionStats;
  weddingWeek: WeddingSectionStats;
  weddingMonth: WeddingSectionStats;
};

/**
 * Same numbers as the previous 12 count queries, in one round trip.
 * docDate is a DATE column. Prisma compares it to the UTC calendar date of the JS bound.
 */
async function loadDashboardWindowCounts(
  today0: Date,
  todayEnd: Date,
  weekFrom: Date,
  monthFrom: Date,
): Promise<DashboardWindowCounts> {
  const rows = await prisma.$queryRaw<
    Array<{
      z_today: number;
      z_week: number;
      z_month: number;
      weddings_today: number;
      weddings_week: number;
      weddings_month: number;
      orders_today: number;
      orders_week: number;
      orders_month: number;
      documented_today: number;
      documented_week: number;
      documented_month: number;
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${today0} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}))) AS z_today,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${weekFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}))) AS z_week,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${monthFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${todayEnd}))) AS z_month,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}) AS weddings_today,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}) AS weddings_week,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${todayEnd}) AS weddings_month,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}) AS orders_today,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}) AS orders_week,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${todayEnd}) AS orders_month,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${today0} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}))) AS documented_today,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${weekFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}))) AS documented_week,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${monthFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${todayEnd}))) AS documented_month
  `;
  const row = rows[0];
  return {
    zToday: Number(row?.z_today ?? 0),
    zWeek: Number(row?.z_week ?? 0),
    zMonth: Number(row?.z_month ?? 0),
    weddingToday: {
      weddings: Number(row?.weddings_today ?? 0),
      orders: Number(row?.orders_today ?? 0),
      documented: Number(row?.documented_today ?? 0),
    },
    weddingWeek: {
      weddings: Number(row?.weddings_week ?? 0),
      orders: Number(row?.orders_week ?? 0),
      documented: Number(row?.documented_week ?? 0),
    },
    weddingMonth: {
      weddings: Number(row?.weddings_month ?? 0),
      orders: Number(row?.orders_month ?? 0),
      documented: Number(row?.documented_month ?? 0),
    },
  };
}

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

/** Same expense-document read the cashflow forecast uses, mapped for supplier totals. */
async function loadSupplierExpenseDocsForDashboard() {
  const rows = await loadSharedExpenseDocuments();
  return rows.map((row) => ({
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
}

export type DashboardHeroSlice = Pick<
  DashboardSummary,
  "updatedAt" | "dbUnavailable" | "heroMetrics" | "todayPnl" | "monthPnl" | "strip"
>;

async function loadCashRowsWithExpenseMeta(fetchFrom: Date) {
  const cashRows = await prisma.cashFlowEntry.findMany({
    where: { entryDate: { gte: fetchFrom } },
    select: {
      entryType: true,
      amount: true,
      entryDate: true,
      paymentMethod: true,
      source: true,
      zReportId: true,
      expenseType: true,
      documentId: true,
    },
  });
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
  return { cashRows, metaByDocId };
}

/** כרטיס עליון — רק תזרים + מנוע כספי (מהיר יותר מ-summary מלא) */
export async function computeDashboardHeroSlice(locale = "he"): Promise<DashboardHeroSlice> {
  try {
    const chartFrom = new Date();
    chartFrom.setDate(chartFrom.getDate() - 35);
    chartFrom.setHours(0, 0, 0, 0);
    const fetchFrom = chartFrom;

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today0);
    todayEnd.setHours(23, 59, 59, 999);

    const weekFrom = boundsForDashboardRange("week").from;
    const monthFrom = boundsForDashboardRange("month").from;

    const [{ cashRows, metaByDocId }, windowCounts] = await Promise.all([
      loadCashRowsWithExpenseMeta(fetchFrom),
      loadDashboardWindowCounts(today0, todayEnd, weekFrom, monthFrom),
    ]);
    const { zToday, zWeek, zMonth, weddingToday, weddingWeek, weddingMonth } = windowCounts;

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
  const chartFrom = new Date();
  chartFrom.setDate(chartFrom.getDate() - 35);
  chartFrom.setHours(0, 0, 0, 0);
  const fetchFrom = chartFrom;

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);
  const nowStart = monthStart(0);
  const weddingHorizon = new Date(today0);
  weddingHorizon.setDate(weddingHorizon.getDate() + 8);
  const dailyHorizon = new Date(today0);
  dailyHorizon.setDate(dailyHorizon.getDate() + 4);
  const weekFrom = boundsForDashboardRange("week").from;
  const monthFrom = boundsForDashboardRange("month").from;

  const activeOrderWhere = {
    isCompleted: false,
    status: { notIn: ["COMPLETED", "CANCELLED"] },
  };

  const [
    cashPack,
    windowCounts,
    alertOrders,
    employeeTasksToday,
    supplierExpenseDocs,
    newCustomers,
    openInvoices,
    shortageProducts,
    notifyWidgets,
    cashflowForecast,
  ] = await Promise.all([
    loadCashRowsWithExpenseMeta(fetchFrom),
    loadDashboardWindowCounts(today0, todayEnd, weekFrom, monthFrom),
    prisma.futureOrder.findMany({
      where: {
        ...activeOrderWhere,
        OR: [
          {
            orderCategory: ORDER_CATEGORY_WEDDING,
            eventDate: { gte: today0, lt: weddingHorizon },
          },
          {
            orderCategory: ORDER_CATEGORY_WEDDING,
            remainingAmount: { gt: 0.000001 },
          },
          {
            orderCategory: ORDER_CATEGORY_WEDDING,
            depositAmount: { lte: 0 },
            depositPaid: false,
          },
          {
            orderCategory: ORDER_CATEGORY_DAILY,
            eventDate: { gte: today0, lt: dailyHorizon },
          },
        ],
      },
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
      take: 80,
    }),
    prisma.employeeTask.findMany({
      where: {
        OR: [
          { completedAt: { gte: today0, lte: todayEnd } },
          { status: { in: ["PENDING", "IN_PROGRESS"] }, targetDueAt: { lte: todayEnd } },
        ],
      },
      select: { status: true, targetDueAt: true, completedAt: true },
    }),
    loadSupplierExpenseDocsForDashboard(),
    prisma.customer.count({ where: { createdAt: { gte: nowStart } } }),
    countOpenInvoices({ log: false }),
    prisma.inventoryProduct.findMany({
      where: { counts: { some: { difference: { lt: 0 } } } },
      select: {
        name: true,
        counts: {
          where: { difference: { lt: 0 }, ...ACTIVE_COUNT_LINE_WHERE },
          orderBy: LATEST_COUNT_ORDER_BY,
          take: 1,
          select: { difference: true },
        },
      },
      take: 40,
    }),
    isSystemCleanMode()
      ? Promise.resolve({ lateEmployees: 0, overdueTasks: 0, pendingChecks: 0, upcomingOrders: 0 })
      : getAdminNotificationWidgets().catch(() => ({
          lateEmployees: 0,
          overdueTasks: 0,
          pendingChecks: 0,
          upcomingOrders: 0,
        })),
    buildCashflowForecast().catch(() => null),
  ]);
  const { zToday, zWeek, zMonth, weddingToday, weddingWeek, weddingMonth } = windowCounts;
  const { cashRows, metaByDocId } = cashPack;

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

  const shortageRows = shortageProducts.map((item) => ({
    name: item.name,
    diff: item.counts[0]?.difference ?? 0,
  }));

  if (shortageRows.length > 0) {
    push({
      id: "inventory-shortage",
      severity: "critical",
      titleKey: "dashboard.shortageTitle",
      detail: `${shortageRows.length}`,
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
