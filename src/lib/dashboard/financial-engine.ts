import {
  EXPENSE_TYPE_VALUES,
  normalizeExpenseType,
  type ExpenseType,
} from "@/lib/finance/expense-types";
import {
  boundsForDashboardRange,
  type DashboardTimeRange,
  type RangeKeyed,
} from "@/lib/dashboard/time-range";

export type CashRow = {
  entryType: string;
  amount: number;
  entryDate: Date;
  paymentMethod: string | null;
  source: string | null;
  zReportId: string | null;
  expenseType: string | null;
  documentId: string | null;
};

export type ExpenseCategoryMetrics = {
  type: ExpenseType;
  today: number;
  week: number;
  month: number;
  prevWeek: number;
  changePctWeek: number | null;
  sparkline: number[];
};

export type ZPosMetrics = {
  reportsToday: number;
  cashToday: number;
  cardToday: number;
  checksToday: number;
  otherToday: number;
};

export type DailyPnlPoint = {
  date: string;
  label: string;
  income: number;
  expenses: number;
  profit: number;
};

export type SupplierPaymentsMetrics = {
  paidCount: number;
  openCount: number;
  lateCount: number;
  pendingCount: number;
  totalPaidAmount: number;
  openDebtAmount: number;
  topSuppliers: { id: string; name: string; amount: number }[];
};

export type TodayPnl = {
  income: number;
  expenses: number;
  profit: number;
};

export type TodayIncomeByMethod = {
  cash: number;
  card: number;
  check: number;
  other: number;
};

export type DashboardHeroMetrics = {
  todayIncomeTotal: number;
  todayIncomeByMethod: TodayIncomeByMethod;
  todayCashIncome: number;
  todayExpenses: number;
  yesterdayExpenses: number;
  expenseChangeVsYesterdayPct: number | null;
  monthIncome: number;
};

export type FinancialEngineResult = {
  monthIncome: number;
  monthExpenses: number;
  prevMonthIncome: number;
  prevMonthExpenses: number;
  totalOperations: number;
  expensesByType: ExpenseCategoryMetrics[];
  zPos: ZPosMetrics;
  zPosByRange: RangeKeyed<ZPosMetrics>;
  dailyChart: DailyPnlPoint[];
  todayPnl: TodayPnl;
  heroMetrics: DashboardHeroMetrics;
  newCustomers: number;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function weekWindow(anchor: Date) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0);
}

function monthEnd(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function pctChange(current: number, previous: number): number | null {
  if (previous < 1) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

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

function isZEntry(row: { source: string | null; zReportId: string | null }) {
  return Boolean(row.zReportId?.trim() || row.source === "z_report");
}

function aggregateZPosForRange(
  cashRows: CashRow[],
  from: Date,
  to: Date,
  zReportsOpenedInRange: number,
): ZPosMetrics {
  let zCash = 0;
  let zCard = 0;
  let zChecks = 0;
  let zOther = 0;
  const zIds = new Set<string>();

  for (const raw of cashRows) {
    const ed = new Date(raw.entryDate);
    if (!inRange(ed, from, to)) continue;
    const row = cashflowAmounts(raw.entryType, raw.amount);
    if (!isZEntry(raw) || row.inflow <= 0) continue;
    const zid = raw.zReportId?.trim() || raw.documentId?.trim();
    if (zid) zIds.add(zid);
    const bucket = zPaymentBucket(raw.paymentMethod);
    if (bucket === "cash") zCash += row.inflow;
    else if (bucket === "card") zCard += row.inflow;
    else if (bucket === "check") zChecks += row.inflow;
    else zOther += row.inflow;
  }

  return {
    reportsToday: zReportsOpenedInRange > 0 ? zReportsOpenedInRange : zIds.size,
    cashToday: zCash,
    cardToday: zCard,
    checksToday: zChecks,
    otherToday: zOther,
  };
}

export function runFinancialEngine(
  cashRows: CashRow[],
  metaByDocId: Map<string, ExpenseType>,
  locale: string,
  zReportsByRange: RangeKeyed<number>,
): FinancialEngineResult {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);
  const yesterday0 = new Date(today0);
  yesterday0.setDate(yesterday0.getDate() - 1);
  const yesterdayEnd = new Date(yesterday0);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const { start: weekStart0, end: weekEnd0 } = weekWindow(today0);
  const prevWeekEnd = new Date(weekStart0);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  prevWeekEnd.setHours(23, 59, 59, 999);
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setDate(prevWeekStart.getDate() - 6);
  prevWeekStart.setHours(0, 0, 0, 0);

  const nowStart = monthStart(0);
  const nowEnd = monthEnd(0);
  const prevStart = monthStart(-1);
  const prevEnd = monthEnd(-1);

  const chartDays = 31;
  const chartFrom = new Date(today0);
  chartFrom.setDate(chartFrom.getDate() - (chartDays - 1));

  const expenseToday = new Map<ExpenseType, number>();
  const expenseWeek = new Map<ExpenseType, number>();
  const expenseMonth = new Map<ExpenseType, number>();
  const expensePrevWeek = new Map<ExpenseType, number>();
  const expenseDaily = new Map<string, Map<ExpenseType, number>>();
  for (const t of EXPENSE_TYPE_VALUES) {
    expenseToday.set(t, 0);
    expenseWeek.set(t, 0);
    expenseMonth.set(t, 0);
    expensePrevWeek.set(t, 0);
  }

  const monthRangeFrom = boundsForDashboardRange("month").from;
  const monthRangeTo = boundsForDashboardRange("month").to;

  const dailyMap = new Map<string, { income: number; expenses: number }>();
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(chartFrom);
    d.setDate(chartFrom.getDate() + i);
    if (d > todayEnd) break;
    dailyMap.set(dayKey(d), { income: 0, expenses: 0 });
  }

  let todayIncome = 0;
  let todayExpenses = 0;
  let yesterdayExpenses = 0;
  let monthIncome = 0;
  const todayIncomeByMethod: TodayIncomeByMethod = { cash: 0, card: 0, check: 0, other: 0 };
  let monthExpenses = 0;
  let prevMonthIncome = 0;
  let prevMonthExpenses = 0;
  let totalOperations = 0;

  for (const raw of cashRows) {
    const row = cashflowAmounts(raw.entryType, raw.amount);
    const ed = new Date(raw.entryDate);
    const inMonth = inRange(ed, nowStart, nowEnd);
    const inPrevMonth = inRange(ed, prevStart, prevEnd);
    if (inMonth || inPrevMonth) totalOperations += 1;

    if (inMonth) {
      monthIncome += row.inflow;
      monthExpenses += row.outflow;
    } else if (inPrevMonth) {
      prevMonthIncome += row.inflow;
      prevMonthExpenses += row.outflow;
    }

    if (inRange(ed, today0, todayEnd)) {
      todayIncome += row.inflow;
      todayExpenses += row.outflow;
      if (row.inflow > 0) {
        const bucket = zPaymentBucket(raw.paymentMethod);
        todayIncomeByMethod[bucket] += row.inflow;
      }
    }

    if (inRange(ed, yesterday0, yesterdayEnd)) {
      yesterdayExpenses += row.outflow;
    }

    const dk = dayKey(ed);
    const dayAgg = dailyMap.get(dk);
    if (dayAgg) {
      dayAgg.income += row.inflow;
      dayAgg.expenses += row.outflow;
    }

    if (row.outflow > 0) {
      const et =
        (raw.expenseType as ExpenseType | null) ??
        (raw.documentId ? metaByDocId.get(raw.documentId) : undefined) ??
        "SUPPLIER_PAYMENTS";
      const type = normalizeExpenseType(et);

      if (inRange(ed, today0, todayEnd)) {
        expenseToday.set(type, (expenseToday.get(type) ?? 0) + row.outflow);
      }
      if (inRange(ed, weekStart0, weekEnd0)) {
        expenseWeek.set(type, (expenseWeek.get(type) ?? 0) + row.outflow);
      }
      if (inRange(ed, prevWeekStart, prevWeekEnd)) {
        expensePrevWeek.set(type, (expensePrevWeek.get(type) ?? 0) + row.outflow);
      }
      if (inRange(ed, monthRangeFrom, monthRangeTo)) {
        expenseMonth.set(type, (expenseMonth.get(type) ?? 0) + row.outflow);
      }

      const sk = dayKey(ed);
      if (!expenseDaily.has(sk)) expenseDaily.set(sk, new Map());
      const m = expenseDaily.get(sk)!;
      m.set(type, (m.get(type) ?? 0) + row.outflow);
    }

  }

  const zPosByRange = (["today", "week", "month"] as const).reduce(
    (acc, key) => {
      const { from, to } = boundsForDashboardRange(key);
      acc[key] = aggregateZPosForRange(cashRows, from, to, zReportsByRange[key]);
      return acc;
    },
    {} as RangeKeyed<ZPosMetrics>,
  );

  const sparkDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    sparkDays.push(dayKey(d));
  }

  const expensesByType = EXPENSE_TYPE_VALUES.map((type) => {
    const week = expenseWeek.get(type) ?? 0;
    const prevWeek = expensePrevWeek.get(type) ?? 0;
    return {
      type,
      today: expenseToday.get(type) ?? 0,
      week,
      month: expenseMonth.get(type) ?? 0,
      prevWeek,
      changePctWeek: pctChange(week, prevWeek),
      sparkline: sparkDays.map((sk) => expenseDaily.get(sk)?.get(type) ?? 0),
    };
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

  return {
    monthIncome,
    monthExpenses,
    prevMonthIncome,
    prevMonthExpenses,
    totalOperations,
    expensesByType,
    zPos: zPosByRange.today,
    zPosByRange,
    dailyChart,
    todayPnl: {
      income: todayIncome,
      expenses: todayExpenses,
      profit: todayIncome - todayExpenses,
    },
    heroMetrics: {
      todayIncomeTotal: todayIncome,
      todayIncomeByMethod,
      todayCashIncome: todayIncomeByMethod.cash,
      todayExpenses,
      yesterdayExpenses,
      expenseChangeVsYesterdayPct: pctChange(todayExpenses, yesterdayExpenses),
      monthIncome,
    },
    newCustomers: 0,
  };
}

export function aggregateSupplierPayments(
  docs: {
    id: string;
    totalAmount: number;
    depositAmount: number | null;
    paymentStatus: string;
    docDate: Date | null;
    metadata: unknown;
    supplierId: string | null;
    supplierName?: string | null;
    paidAmount?: number;
  }[],
  today0: Date,
): SupplierPaymentsMetrics {
  const todayMs = today0.getTime();
  let paidCount = 0;
  let openCount = 0;
  let lateCount = 0;
  let pendingCount = 0;
  let totalPaidAmount = 0;
  let openDebtAmount = 0;
  const bySupplier = new Map<string, { name: string; amount: number }>();

  for (const doc of docs) {
    const meta = doc.metadata as { expenseType?: unknown } | null;
    if (normalizeExpenseType(meta?.expenseType) !== "SUPPLIER_PAYMENTS") continue;
    const net = Math.max(0, doc.totalAmount - (doc.depositAmount ?? 0));
    if (net < 0.01) continue;

    const status = (doc.paymentStatus ?? "unpaid").toLowerCase();
    const paid = Math.max(0, doc.paidAmount ?? (status === "paid" ? net : status === "partial" ? net * 0.5 : 0));

    if (status === "paid" || paid >= net - 1e-6) {
      paidCount += 1;
      totalPaidAmount += net;
      if (doc.supplierId) {
        const name = doc.supplierName?.trim() || "—";
        const cur = bySupplier.get(doc.supplierId) ?? { name, amount: 0 };
        cur.amount += net;
        bySupplier.set(doc.supplierId, cur);
      }
    } else if (status === "partial") {
      pendingCount += 1;
      openDebtAmount += Math.max(0, net - paid);
    } else {
      const due = doc.docDate ? new Date(doc.docDate).getTime() : null;
      if (due != null && due < todayMs) lateCount += 1;
      else openCount += 1;
      openDebtAmount += Math.max(0, net - paid);
    }
  }

  const topSuppliers = [...bySupplier.entries()]
    .map(([id, v]) => ({ id, name: v.name, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    paidCount,
    openCount,
    lateCount,
    pendingCount,
    totalPaidAmount,
    openDebtAmount,
    topSuppliers,
  };
}
