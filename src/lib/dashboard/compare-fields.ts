import type { DashboardSummary } from "@/lib/dashboard/summary";
import type { ShelfSummaryStats } from "@/lib/inventory/shelf-service";

export function dashboardFinancialFingerprint(summary: DashboardSummary) {
  return {
    hero: summary.heroMetrics,
    todayPnl: summary.todayPnl,
    monthPnl: summary.monthPnl,
    strip: {
      netProfit: summary.strip.netProfit,
      totalIncome: summary.strip.totalIncome,
      totalExpenses: summary.strip.totalExpenses,
      totalOperations: summary.strip.totalOperations,
    },
    expensesByType: summary.expensesByType.map((row) => ({
      type: row.type,
      today: row.today,
      week: row.week,
      month: row.month,
    })),
    zPos: summary.zPos,
    zPosByRange: summary.zPosByRange,
    supplierPayments: {
      paidCount: summary.supplierPayments.paidCount,
      openCount: summary.supplierPayments.openCount,
      lateCount: summary.supplierPayments.lateCount,
      pendingCount: summary.supplierPayments.pendingCount,
      totalPaidAmount: summary.supplierPayments.totalPaidAmount,
      openDebtAmount: summary.supplierPayments.openDebtAmount,
      topSuppliers: summary.supplierPayments.topSuppliers,
    },
    tasksChart: summary.tasksChart,
    weddings: summary.weddings,
    weddingsByRange: summary.weddingsByRange,
    dailyChart: summary.dailyChart,
  };
}

export function diffUnknown(a: unknown, b: unknown, path = ""): string[] {
  if (Object.is(a, b)) return [];
  if (typeof a !== typeof b) return [`${path}: type ${typeof a} vs ${typeof b}`];
  if (a == null || b == null) return [`${path}: ${String(a)} vs ${String(b)}`];
  if (typeof a !== "object") {
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-6) return [];
    return [`${path}: ${String(a)} vs ${String(b)}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${path}: length ${a.length} vs ${b.length}`];
    return a.flatMap((item, i) => diffUnknown(item, b[i], `${path}[${i}]`));
  }
  const ak = Object.keys(a as object).sort();
  const bk = Object.keys(b as object).sort();
  if (ak.join() !== bk.join()) return [`${path}: keys ${ak.join(",")} vs ${bk.join(",")}`];
  return ak.flatMap((key) =>
    diffUnknown((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key),
  );
}

export function shelfFingerprint(rows: ShelfSummaryStats[]) {
  return [...rows]
    .map((row) => ({
      locationId: row.locationId,
      name: row.name,
      productCount: row.productCount,
      shortageCount: row.shortageCount,
      surplusCount: row.surplusCount,
      okCount: row.okCount,
      matchPct: row.matchPct,
      countedProductCount: row.countedProductCount,
      countStatus: row.countStatus,
    }))
    .sort((a, b) => (a.locationId ?? a.name).localeCompare(b.locationId ?? b.name));
}
