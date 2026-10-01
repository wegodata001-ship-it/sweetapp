import type { DashboardHeroMetrics } from "@/lib/dashboard/financial-engine";
import type { DashboardTimeRange } from "@/lib/dashboard/time-range";

export const DEFAULT_HERO_RANGE: DashboardTimeRange = "month";

export type HeroPeriodSlice = {
  cashBalance: number;
  income: number;
  cashIncome: number;
  expenses: number;
};

/** Client/display cache key — period is part of the key so MONTH cannot be read as TODAY. */
export function heroPeriodCacheKey(range: DashboardTimeRange, updatedAt: string | null): string {
  return `dashboard-hero-period:${range}:${updatedAt ?? ""}`;
}

export function heroSlice(hero: DashboardHeroMetrics, range: DashboardTimeRange): HeroPeriodSlice {
  if (range === "today") {
    return {
      cashBalance: hero.todayCashIncome - hero.todayCashExpenses,
      income: hero.todayIncomeTotal,
      cashIncome: hero.todayCashIncome,
      expenses: hero.todayExpenses,
    };
  }
  if (range === "week") {
    return {
      cashBalance: hero.weekCashIncome - hero.weekCashExpenses,
      income: hero.weekIncome,
      cashIncome: hero.weekCashIncome,
      expenses: hero.weekExpenses,
    };
  }
  return {
    cashBalance: hero.monthCashBalance,
    income: hero.monthIncome,
    cashIncome: hero.monthCashIncome,
    expenses: hero.monthExpenses,
  };
}
