import { prisma } from "@/lib/prisma";
import { normalizeExpenseType, type ExpenseType } from "@/lib/finance/expense-types";
import { getAdminNotificationWidgets } from "@/lib/notifications/admin-widgets";
import { countOpenInvoices } from "@/lib/finance/open-invoices";
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

async function countZReportsInRange(from: Date, to: Date): Promise<number> {
  return prisma.financialDocument.count({
    where: {
      documentType: "דוח Z",
      OR: [
        { docDate: { gte: from, lte: to } },
        { docDate: null, createdAt: { gte: from, lte: to } },
      ],
    },
  });
}

async function loadWeddingSectionStats(from: Date, to: Date): Promise<WeddingSectionStats> {
  const [weddings, orders, documented] = await Promise.all([
    prisma.futureOrder.count({
      where: { orderCategory: ORDER_CATEGORY_WEDDING, createdAt: { gte: from, lte: to } },
    }),
    prisma.futureOrder.count({
      where: { orderCategory: ORDER_CATEGORY_DAILY, createdAt: { gte: from, lte: to } },
    }),
    prisma.financialDocument.count({
      where: {
        category: "הכנסה",
        sentToCpa: true,
        OR: [
          { docDate: { gte: from, lte: to } },
          { docDate: null, createdAt: { gte: from, lte: to } },
        ],
      },
    }),
  ]);
  return { weddings, orders, documented };
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

function isMissingPrismaColumn(e: unknown, column: string): boolean {
  if (typeof e !== "object" || e === null || !("code" in e)) return false;
  if ((e as { code: string }).code !== "P2022") return false;
  const meta = (e as { meta?: { column?: string } }).meta;
  return String(meta?.column ?? "").includes(column);
}

/** טוען מסמכי הוצאה לספקים — עובד גם בלי עמודת supplierId במסד (לפני migration). */
async function loadSupplierExpenseDocsForDashboard() {
  const baseSelect = {
    id: true,
    totalAmount: true,
    depositAmount: true,
    paidAmount: true,
    paymentStatus: true,
    metadata: true,
    docDate: true,
    title: true,
  } as const;

  try {
    const rows = await prisma.financialDocument.findMany({
      where: { category: "הוצאה" },
      select: {
        ...baseSelect,
        supplierId: true,
      },
    });
    const supplierIds = [
      ...new Set(rows.map((r) => r.supplierId).filter((id): id is string => Boolean(id))),
    ];
    const nameById = new Map<string, string>();
    if (supplierIds.length > 0) {
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name: true },
      });
      for (const s of suppliers) nameById.set(s.id, s.name);
    }
    return rows.map((r) => ({
      id: r.id,
      totalAmount: r.totalAmount,
      depositAmount: r.depositAmount,
      paidAmount: r.paidAmount,
      paymentStatus: r.paymentStatus,
      metadata: r.metadata,
      docDate: r.docDate,
      supplierId: r.supplierId,
      supplierName: r.supplierId ? (nameById.get(r.supplierId) ?? null) : null,
    }));
  } catch (e) {
    if (!isMissingPrismaColumn(e, "supplierId")) throw e;

    const rows = await prisma.financialDocument.findMany({
      where: { category: "הוצאה" },
      select: baseSelect,
    });

    const metaIds = new Set<string>();
    for (const r of rows) {
      const meta = r.metadata as { supplierId?: string } | null;
      const sid = typeof meta?.supplierId === "string" ? meta.supplierId.trim() : "";
      if (sid) metaIds.add(sid);
    }

    const nameById = new Map<string, string>();
    if (metaIds.size > 0) {
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: [...metaIds] } },
        select: { id: true, name: true },
      });
      for (const s of suppliers) nameById.set(s.id, s.name);
    }

    return rows.map((r) => {
      const meta = r.metadata as { supplierId?: string } | null;
      const sid = typeof meta?.supplierId === "string" ? meta.supplierId.trim() || null : null;
      return {
        id: r.id,
        totalAmount: r.totalAmount,
        depositAmount: r.depositAmount,
        paidAmount: r.paidAmount,
        paymentStatus: r.paymentStatus,
        metadata: r.metadata,
        docDate: r.docDate,
        supplierId: sid,
        supplierName: sid ? (nameById.get(sid) ?? r.title) : null,
      };
    });
  }
}

export type DashboardHeroSlice = Pick<
  DashboardSummary,
  "updatedAt" | "dbUnavailable" | "heroMetrics" | "todayPnl" | "monthPnl" | "strip"
>;

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

    const [cashRows, zToday, zWeek, zMonth, weddingToday, weddingWeek, weddingMonth] =
      await Promise.all([
        prisma.cashFlowEntry.findMany({
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
        }),
        countZReportsInRange(today0, todayEnd),
        countZReportsInRange(weekFrom, todayEnd),
        countZReportsInRange(monthFrom, todayEnd),
        loadWeddingSectionStats(today0, todayEnd),
        loadWeddingSectionStats(weekFrom, todayEnd),
        loadWeddingSectionStats(monthFrom, todayEnd),
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
    cashRows,
    zToday,
    zWeek,
    zMonth,
    weddingToday,
    weddingWeek,
    weddingMonth,
    alertOrders,
    employeeTasksToday,
    supplierExpenseDocs,
    newCustomers,
    openInvoices,
    shortageProducts,
    notifyWidgets,
  ] = await Promise.all([
    prisma.cashFlowEntry.findMany({
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
    }),
    countZReportsInRange(today0, todayEnd),
    countZReportsInRange(weekFrom, todayEnd),
    countZReportsInRange(monthFrom, todayEnd),
    loadWeddingSectionStats(today0, todayEnd),
    loadWeddingSectionStats(weekFrom, todayEnd),
    loadWeddingSectionStats(monthFrom, todayEnd),
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
          where: { difference: { lt: 0 } },
          orderBy: { countDate: "desc" },
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
