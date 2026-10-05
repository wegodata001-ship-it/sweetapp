/**
 * Run: npx tsx --test src/lib/dashboard/hero-period.test.ts src/lib/dashboard/time-range.test.ts src/lib/dashboard/compare-fields.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CashRow, DashboardHeroMetrics } from "@/lib/dashboard/financial-engine";
import { runFinancialEngine } from "@/lib/dashboard/financial-engine";
import { DEFAULT_HERO_RANGE, heroPeriodCacheKey, heroSlice } from "@/lib/dashboard/hero-period";
import { boundsForDashboardRange, type DashboardTimeRange } from "@/lib/dashboard/time-range";

function cashflowAmounts(entryType: string, amount: number) {
  const t = entryType.toLowerCase();
  const raw = Number(amount);
  let inflow = 0;
  let outflow = 0;
  if (Number.isFinite(raw)) {
    if (t === "income" || t === "deposit" || t === "invoice") inflow = raw >= 0 ? raw : 0;
    else if (["expense", "refund", "supplier_payment", "salary", "deposit_refund"].includes(t))
      outflow = raw >= 0 ? raw : -raw;
  }
  return { inflow, outflow };
}

function zPaymentBucket(method: string | null | undefined): "cash" | "card" | "check" | "other" {
  const k = (method ?? "").toLowerCase();
  if (/check|שיק|cheque/.test(k)) return "check";
  if (/credit|card|אשראי|visa|master/.test(k)) return "card";
  if (/cash|מזומן|cash_register/.test(k)) return "cash";
  return "other";
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function independentPeriod(rows: CashRow[], range: DashboardTimeRange) {
  const { from, to } = boundsForDashboardRange(range);
  let income = 0;
  let expenses = 0;
  let cashIncome = 0;
  let cashExpenses = 0;
  for (const raw of rows) {
    const ed = new Date(raw.entryDate);
    if (!inRange(ed, from, to)) continue;
    const amt = cashflowAmounts(raw.entryType, raw.amount);
    income += amt.inflow;
    expenses += amt.outflow;
    const bucket = zPaymentBucket(raw.paymentMethod);
    if (amt.inflow > 0 && bucket === "cash") cashIncome += amt.inflow;
    if (amt.outflow > 0 && bucket === "cash") cashExpenses += amt.outflow;
  }
  return {
    cashBalance: cashIncome - cashExpenses,
    income,
    cashIncome,
    expenses,
  };
}

function row(
  entryType: string,
  amount: number,
  entryDate: Date,
  paymentMethod: string,
): CashRow {
  return {
    entryType,
    amount,
    entryDate,
    paymentMethod,
    source: null,
    zReportId: null,
    expenseType: null,
    documentId: null,
  };
}

function atNoon(d: Date) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function emptyHero(overrides: Partial<DashboardHeroMetrics> = {}): DashboardHeroMetrics {
  return {
    todayIncomeTotal: 10,
    todayIncomeByMethod: { cash: 4, card: 6, check: 0, other: 0 },
    todayCashIncome: 4,
    todayCashExpenses: 1,
    todayExpenses: 2,
    yesterdayExpenses: 0,
    expenseChangeVsYesterdayPct: null,
    monthIncome: 100,
    monthIncomeByMethod: { cash: 40, card: 60, check: 0, other: 0 },
    monthCashIncome: 40,
    monthCashExpenses: 15,
    monthCashBalance: 25,
    monthExpenses: 30,
    monthProfit: 70,
    weekIncome: 50,
    weekIncomeByMethod: { cash: 20, card: 30, check: 0, other: 0 },
    weekCashIncome: 20,
    weekCashExpenses: 8,
    weekExpenses: 12,
    ...overrides,
  };
}

describe("hero period filter", () => {
  it("defaults to month", () => {
    assert.equal(DEFAULT_HERO_RANGE, "month");
  });

  it("maps only cash/income/cash-income/expenses for each range", () => {
    const hero = emptyHero();
    assert.deepEqual(heroSlice(hero, "today"), {
      cashBalance: 3,
      income: 10,
      cashIncome: 4,
      expenses: 2,
    });
    assert.deepEqual(heroSlice(hero, "week"), {
      cashBalance: 12,
      income: 50,
      cashIncome: 20,
      expenses: 12,
    });
    assert.deepEqual(heroSlice(hero, "month"), {
      cashBalance: 25,
      income: 100,
      cashIncome: 40,
      expenses: 30,
    });
  });

  it("does not put customer debt or payables on the period slice", () => {
    const slice = heroSlice(emptyHero(), "today");
    assert.deepEqual(Object.keys(slice).sort(), ["cashBalance", "cashIncome", "expenses", "income"]);
  });

  it("keeps period cache keys distinct so MONTH cannot be read as TODAY", () => {
    const updatedAt = "2026-10-01T18:00:00.000Z";
    const monthKey = heroPeriodCacheKey("month", updatedAt);
    const todayKey = heroPeriodCacheKey("today", updatedAt);
    const weekKey = heroPeriodCacheKey("week", updatedAt);
    assert.match(monthKey, /month/);
    assert.match(todayKey, /today/);
    assert.match(weekKey, /week/);
    assert.notEqual(monthKey, todayKey);
    assert.notEqual(monthKey, weekKey);
    assert.notEqual(todayKey, weekKey);

    const store = new Map<string, ReturnType<typeof heroSlice>>();
    const hero = emptyHero();
    store.set(monthKey, heroSlice(hero, "month"));
    assert.equal(store.get(todayKey), undefined);
    assert.equal(store.get(monthKey)?.income, 100);
  });

  it("ignores a stale MONTH generation after TODAY wins", () => {
    let generation = 0;
    let shown = heroSlice(emptyHero(), "month");
    const apply = (gen: number, range: DashboardTimeRange, hero: DashboardHeroMetrics) => {
      if (gen !== generation) return;
      shown = heroSlice(hero, range);
    };

    generation = 1;
    apply(1, "month", emptyHero());
    generation = 2;
    apply(2, "week", emptyHero());
    generation = 3;
    apply(3, "today", emptyHero());
    apply(1, "month", emptyHero({ monthIncome: 9999, monthCashBalance: 9999 }));

    assert.equal(shown.income, 10);
    assert.equal(shown.cashBalance, 3);
  });

  it("matches independent cashflowAmounts / boundsForDashboardRange math", () => {
    const today = boundsForDashboardRange("today");
    const week = boundsForDashboardRange("week");
    const month = boundsForDashboardRange("month");
    const rows: CashRow[] = [
      row("income", 1000, atNoon(today.from), "cash"),
      row("income", 400, atNoon(today.from), "card"),
      row("expense", 250, atNoon(today.from), "cash"),
      row("expense", 80, atNoon(today.from), "card"),
    ];
    if (week.from.getTime() < today.from.getTime()) {
      rows.push(row("income", 500, atNoon(week.from), "cash"));
      rows.push(row("expense", 90, atNoon(week.from), "cash"));
    }
    if (month.from.getTime() < week.from.getTime()) {
      rows.push(row("income", 800, atNoon(month.from), "cash"));
      rows.push(row("expense", 120, atNoon(month.from), "cash"));
    }

    const engine = runFinancialEngine(rows, new Map(), "he", { today: 0, week: 0, month: 0 });
    for (const range of ["today", "week", "month"] as const) {
      const got = heroSlice(engine.heroMetrics, range);
      const expected = independentPeriod(rows, range);
      assert.deepEqual(got, expected, range);
    }
  });

  it("uses custom period metrics without changing preset cash formula", () => {
    const custom = {
      from: "2026-09-01",
      to: "2026-09-30",
      income: 10000,
      incomeByMethod: { cash: 10000, card: 0, check: 0, other: 0 },
      cashIncome: 10000,
      cashExpenses: 2000,
      expenses: 2000,
      cashBalance: 8000,
    };
    const slice = heroSlice(emptyHero(), "custom", custom);
    assert.deepEqual(slice, {
      cashBalance: 8000,
      income: 10000,
      cashIncome: 10000,
      expenses: 2000,
    });
    assert.notEqual(heroPeriodCacheKey("custom", "t", { from: "2026-09-01", to: "2026-09-30" }), heroPeriodCacheKey("month", "t"));
  });
});
