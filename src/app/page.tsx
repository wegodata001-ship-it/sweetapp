import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ClipboardCheck,
  Package,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/count-up";
import { formatShekel } from "@/lib/format-shekel";
import { WEGO_LOCALE_COOKIE, normalizeLocale, localeToBcp47, type AppLocale } from "@/lib/i18n/constants";
import { createTranslator, type TranslateFn } from "@/lib/i18n/translator";
import { prisma, prismaAny } from "@/lib/prisma";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

type FinanceDoc = {
  id: string;
  category: string;
  totalAmount: number;
  depositAmount: number | null;
  docDate: Date | null;
  createdAt: Date;
};

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0);
}

function monthEnd(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function docDate(doc: FinanceDoc) {
  return doc.docDate ?? doc.createdAt;
}

function docNet(doc: FinanceDoc) {
  return Math.max(0, doc.totalAmount - (doc.depositAmount ?? 0));
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function sumDocs(docs: FinanceDoc[], category: "הכנסה" | "הוצאה", from: Date, to: Date) {
  return docs.reduce((sum, doc) => {
    if (doc.category !== category) return sum;
    return inRange(docDate(doc), from, to) ? sum + docNet(doc) : sum;
  }, 0);
}

function trendLabel(current: number, previous: number, t: TranslateFn) {
  const diff = current - previous;
  if (Math.abs(diff) < 1) return t("dashboard.trendNoChange");
  const sign = diff > 0 ? "+" : "-";
  return t("dashboard.trendDiff", { sign, amount: formatShekel(Math.abs(diff)) });
}

function monthLabel(date: Date, locale: AppLocale) {
  return date.toLocaleDateString(localeToBcp47(locale), { month: "short" });
}

function dayStartLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysFromToday(eventDate: Date, today: Date) {
  const t0 = dayStartLocal(today).getTime();
  const t1 = dayStartLocal(new Date(eventDate)).getTime();
  return Math.round((t1 - t0) / 86400000);
}

async function getDashboardData(t: TranslateFn, locale: AppLocale) {
  const nowStart = monthStart(0);
  const nowEnd = monthEnd(0);
  const prevStart = monthStart(-1);
  const prevEnd = monthEnd(-1);
  const chartStart = monthStart(-3);

  const [docs, payments, supplierRows, employeeRows, ledgerRows, openTaskCount, urgentTaskCount, inventoryProducts] =
    await Promise.all([
      prisma.financialDocument.findMany({
        where: {
          category: { in: ["הכנסה", "הוצאה"] },
          OR: [
            { docDate: { gte: chartStart } },
            { docDate: null, createdAt: { gte: chartStart } },
            { category: "הכנסה" },
          ],
        },
        select: {
          id: true,
          category: true,
          totalAmount: true,
          depositAmount: true,
          docDate: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          document: { is: { category: "הכנסה" } },
        },
        select: { documentId: true, amount: true },
      }),
      prisma.supplier.findMany({ select: { id: true, openingBalance: true } }),
      prisma.employee.findMany({ select: { id: true, openingBalance: true } }),
      prisma.ledgerEntry.findMany({
        select: { supplierId: true, employeeId: true, debit: true, credit: true },
      }),
      prisma.employeeTask.count({ where: { status: { not: "COMPLETED" } } }),
      prisma.employeeTask.count({
        where: { status: "IN_PROGRESS" },
      }),
      prisma.inventoryProduct.findMany({
        select: {
          id: true,
          name: true,
          counts: {
            orderBy: { countDate: "desc" },
            take: 1,
            select: { difference: true },
          },
        },
      }),
    ]);

  // Checks stats — best-effort; failure must not break the whole dashboard.
  let checkStats: {
    open: number;
    late: number;
    lateAmount: number;
    thisWeek: number;
    thisWeekAmount: number;
    futureAmount: number;
  } = {
    open: 0,
    late: 0,
    lateAmount: 0,
    thisWeek: 0,
    thisWeekAmount: 0,
    futureAmount: 0,
  };
  try {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const todayPlus7 = new Date(today0);
    todayPlus7.setDate(todayPlus7.getDate() + 7);
    const [openCount, lateAgg, weekAgg, futureAgg] = await Promise.all([
      prismaAny.checkPayment.count({ where: { status: { in: ["PENDING", "DEPOSITED"] } } }),
      prismaAny.checkPayment.aggregate({
        where: {
          status: { in: ["PENDING", "DEPOSITED"] },
          dueDate: { lt: today0 },
        },
        _count: true,
        _sum: { amount: true },
      }),
      prismaAny.checkPayment.aggregate({
        where: {
          status: { in: ["PENDING", "DEPOSITED"] },
          dueDate: { gte: today0, lte: todayPlus7 },
        },
        _count: true,
        _sum: { amount: true },
      }),
      prismaAny.checkPayment.aggregate({
        where: {
          status: { in: ["PENDING", "DEPOSITED"] },
          dueDate: { gte: today0 },
        },
        _sum: { amount: true },
      }),
    ]);
    checkStats = {
      open: openCount as number,
      late: (lateAgg as { _count: number })._count ?? 0,
      lateAmount: (lateAgg as { _sum: { amount: number | null } })._sum.amount ?? 0,
      thisWeek: (weekAgg as { _count: number })._count ?? 0,
      thisWeekAmount: (weekAgg as { _sum: { amount: number | null } })._sum.amount ?? 0,
      futureAmount:
        (futureAgg as { _sum: { amount: number | null } })._sum.amount ?? 0,
    };
  } catch {
    /* ignore — table may not exist on every install */
  }

  const futureOrders = await prisma.futureOrder.findMany({
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      eventDate: true,
      depositAmount: true,
      depositPaid: true,
      remainingAmount: true,
      status: true,
      isCompleted: true,
    },
  });

  const financeDocs = docs as FinanceDoc[];
  const paymentsByDocument = new Map<string, number>();
  let customerPaymentTotal = 0;
  for (const payment of payments) {
    const amount = Math.max(0, payment.amount);
    customerPaymentTotal += amount;
    if (!payment.documentId) continue;
    paymentsByDocument.set(payment.documentId, (paymentsByDocument.get(payment.documentId) ?? 0) + amount);
  }
  const income = sumDocs(financeDocs, "הכנסה", nowStart, nowEnd);
  const expenses = sumDocs(financeDocs, "הוצאה", nowStart, nowEnd);
  const prevIncome = sumDocs(financeDocs, "הכנסה", prevStart, prevEnd);
  const prevExpenses = sumDocs(financeDocs, "הוצאה", prevStart, prevEnd);
  const profit = income - expenses;
  const prevProfit = prevIncome - prevExpenses;

  const customerOrderTotal = financeDocs.reduce(
    (sum, doc) => (doc.category === "הכנסה" ? sum + Math.max(0, doc.totalAmount) : sum),
    0,
  );
  const openCustomerBalance = Math.max(0, customerOrderTotal - customerPaymentTotal);
  const ledgerNet = new Map<string, number>();
  for (const row of ledgerRows) {
    const supplierKey = row.supplierId ? `supplier:${row.supplierId}` : null;
    const employeeKey = row.employeeId ? `employee:${row.employeeId}` : null;
    const key = supplierKey ?? employeeKey;
    if (!key) continue;
    ledgerNet.set(key, (ledgerNet.get(key) ?? 0) + row.debit - row.credit);
  }
  const supplierOpen = supplierRows.reduce(
    (sum, row) => sum + Math.max(0, row.openingBalance + (ledgerNet.get(`supplier:${row.id}`) ?? 0)),
    0,
  );
  const employeeOpen = employeeRows.reduce(
    (sum, row) => sum + Math.max(0, row.openingBalance + (ledgerNet.get(`employee:${row.id}`) ?? 0)),
    0,
  );
  const openBalances = openCustomerBalance + supplierOpen + employeeOpen;

  const openInvoices = financeDocs.filter(
    (doc) => doc.category === "הכנסה" && Math.max(0, doc.totalAmount - (paymentsByDocument.get(doc.id) ?? 0)) > 0,
  ).length;
  const shortageRows = inventoryProducts
    .map((item) => ({ name: item.name, diff: item.counts[0]?.difference ?? 0 }))
    .filter((item) => item.diff < 0)
    .sort((a, b) => a.diff - b.diff);

  const today = new Date();
  const weekStart = dayStartLocal(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const futureOrderActive = (o: (typeof futureOrders)[number]) =>
    !o.isCompleted && o.status !== "COMPLETED" && o.status !== "CANCELLED";

  const futureOrdersWeekCount = futureOrders.filter((o) => {
    const ed = dayStartLocal(new Date(o.eventDate)).getTime();
    return ed >= weekStart.getTime() && ed <= weekEnd.getTime() && o.status !== "CANCELLED";
  }).length;

  const futureOrdersTodayCount = futureOrders.filter((o) => {
    return daysFromToday(o.eventDate, today) === 0 && o.status !== "CANCELLED";
  }).length;

  const futureOrdersNoDepositCount = futureOrders.filter(
    (o) => futureOrderActive(o) && (o.depositAmount ?? 0) < 1e-6 && !o.depositPaid,
  ).length;

  const futureOrdersOpenCount = futureOrders.filter((o) => futureOrderActive(o)).length;

  type FutureAlert = { kind: "soon" | "no_deposit" | "balance"; detail: string; href: string };
  const futureOrderAlerts: FutureAlert[] = [];
  const alertKeys = new Set<string>();
  for (const o of futureOrders) {
    if (!futureOrderActive(o)) continue;
    const d = daysFromToday(o.eventDate, today);
    if (d >= 0 && d <= 3) {
      const key = `soon:${o.id}`;
      if (!alertKeys.has(key)) {
        alertKeys.add(key);
        const when = d === 0 ? t("common.today") : t("common.inDays", { days: d });
        futureOrderAlerts.push({
          kind: "soon",
          detail: t("dashboard.alertSoonDetail", {
            when,
            customer: o.customerName,
            orderNumber: String(o.orderNumber),
          }),
          href: "/admin/future-orders",
        });
      }
    }
    if ((o.depositAmount ?? 0) < 1e-6 && !o.depositPaid) {
      const key = `no_deposit:${o.id}`;
      if (!alertKeys.has(key)) {
        alertKeys.add(key);
        futureOrderAlerts.push({
          kind: "no_deposit",
          detail: t("dashboard.alertNoDepositDetail", {
            customer: o.customerName,
            orderNumber: String(o.orderNumber),
          }),
          href: "/admin/future-orders",
        });
      }
    }
    if ((o.remainingAmount ?? 0) > 1e-6) {
      const key = `balance:${o.id}`;
      if (!alertKeys.has(key)) {
        alertKeys.add(key);
        futureOrderAlerts.push({
          kind: "balance",
          detail: t("dashboard.alertBalanceDetail", {
            customer: o.customerName,
            orderNumber: String(o.orderNumber),
          }),
          href: "/admin/future-orders",
        });
      }
    }
  }

  const chart = Array.from({ length: 3 }, (_, idx) => {
    const offset = idx - 2;
    const d = monthStart(offset);
    const from = monthStart(offset);
    const to = monthEnd(offset);
    const monthIncome = sumDocs(financeDocs, "הכנסה", from, to);
    const monthExpenses = sumDocs(financeDocs, "הוצאה", from, to);
    return {
      label: monthLabel(d, locale),
      income: monthIncome,
      expenses: monthExpenses,
      profit: monthIncome - monthExpenses,
    };
  });

  return {
    income,
    expenses,
    profit,
    prevIncome,
    prevExpenses,
    prevProfit,
    openBalances,
    openTaskCount,
    urgentTaskCount,
    openInvoices,
    shortageRows,
    chart,
    futureOrdersWeekCount,
    futureOrdersTodayCount,
    futureOrdersNoDepositCount,
    futureOrdersOpenCount,
    futureOrderAlerts: futureOrderAlerts.slice(0, 12),
    checks: checkStats,
  };
}

function KpiCard({
  title,
  value,
  tone,
  icon,
  trend,
  currency = true,
}: {
  title: string;
  value: number;
  tone: string;
  icon: ReactNode;
  trend: string;
  currency?: boolean;
}) {
  return (
    <article
      className="flex min-h-[120px] flex-col justify-between rounded-[18px] border border-slate-200/90 bg-white p-4 shadow-sm"
      style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-slate-600 opacity-70">{title}</p>
        <span className={`shrink-0 rounded-xl p-2 ${tone}`}>{icon}</span>
      </div>
      {currency ? (
        <CountUp value={value} currency className="block text-[38px] font-black leading-none tracking-tight text-slate-950 tabular-nums" />
      ) : (
        <span className="block text-[38px] font-black leading-none tracking-tight text-slate-950 tabular-nums">
          {Math.round(value)}
        </span>
      )}
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-600 opacity-70">{trend}</p>
    </article>
  );
}

const CHART_TOTAL_H = 280;

export default async function Home() {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const t = createTranslator(locale);
  const data = await getDashboardData(t, locale);
  const maxChart = Math.max(
    1,
    ...data.chart.flatMap((m) => [m.income, m.expenses, Math.max(0, m.profit)]),
  );

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-2.5 pb-2 pt-0">
      {/* Hero — ERP compact */}
      <section className="relative flex min-h-0 flex-col justify-center overflow-hidden rounded-[18px] border border-luxury-gold/20 bg-gradient-to-br from-luxury-navy-rich via-luxury-charcoal to-slate-950 px-8 py-7 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-luxury-gold/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-16 right-12 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="relative z-[1] min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white/80">{t("dashboard.heroKicker")}</p>
          <h1 className="mt-1 text-[clamp(2rem,2.6vw,2.625rem)] font-black leading-[1.1] tracking-tight text-white">
            {t("dashboard.heroTitle")}
          </h1>
          <p className="mt-1.5 max-w-md text-[15px] leading-snug text-white/80">{t("dashboard.heroSubtitle")}</p>
        </div>

        <div className="relative z-[1] mt-6 flex w-full flex-shrink-0 flex-col gap-4 sm:flex-row sm:items-end lg:mt-0 lg:w-auto lg:min-w-[320px]">
          <div className="rounded-[18px] border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
            <p className="text-[13px] font-semibold text-white/70">{t("dashboard.netProfitMonth")}</p>
            <CountUp
              value={data.profit}
              currency
              className={`mt-1 block text-[64px] font-black leading-none tracking-tight ${
                data.profit >= 0 ? "text-luxury-gold" : "text-rose-300"
              }`}
            />
          </div>
          <div className="flex flex-1 gap-2 sm:min-w-0">
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-emerald-200/90 opacity-90">{t("dashboard.income")}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.income)}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-rose-400/20 bg-rose-500/10 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-rose-200/90 opacity-90">{t("dashboard.expenses")}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.expenses)}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-luxury-gold/25 bg-luxury-gold/10 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-luxury-gold/90 opacity-90">{t("dashboard.profit")}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.profit)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("dashboard.kpiIncomeMonth")}
          value={data.income}
          tone="bg-emerald-50 text-emerald-700"
          icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
          trend={trendLabel(data.income, data.prevIncome, t)}
        />
        <KpiCard
          title={t("dashboard.kpiExpensesMonth")}
          value={data.expenses}
          tone="bg-rose-50 text-rose-700"
          icon={<ArrowDownRight className="h-4 w-4" aria-hidden />}
          trend={trendLabel(data.expenses, data.prevExpenses, t)}
        />
        <KpiCard
          title={t("dashboard.kpiOpenBalances")}
          value={data.openBalances}
          tone="bg-blue-50 text-blue-700"
          icon={<WalletCards className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiOpenBalancesTrend")}
        />
        <KpiCard
          title={t("dashboard.kpiOpenTasks")}
          value={data.openTaskCount}
          currency={false}
          tone="bg-amber-50 text-amber-800"
          icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiOpenTasksTrend")}
        />
      </section>

      <section className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("dashboard.kpiFutureWeek")}
          value={data.futureOrdersWeekCount}
          currency={false}
          tone="bg-cyan-50 text-cyan-800"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiFutureWeekTrend")}
        />
        <KpiCard
          title={t("dashboard.kpiEventsToday")}
          value={data.futureOrdersTodayCount}
          currency={false}
          tone="bg-indigo-50 text-indigo-800"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiEventsTodayTrend")}
        />
        <KpiCard
          title={t("dashboard.kpiNoDeposit")}
          value={data.futureOrdersNoDepositCount}
          currency={false}
          tone="bg-orange-50 text-orange-900"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiNoDepositTrend")}
        />
        <KpiCard
          title={t("dashboard.kpiOpenFuture")}
          value={data.futureOrdersOpenCount}
          currency={false}
          tone="bg-teal-50 text-teal-900"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiOpenFutureTrend")}
        />
      </section>

      {/* Checks KPIs */}
      <section className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("dashboard.kpiChecksOpen")}
          value={data.checks.open}
          currency={false}
          tone="bg-indigo-50 text-indigo-700"
          icon={<Banknote className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiChecksOpenTrend")}
        />
        <KpiCard
          title={t("dashboard.kpiChecksLate")}
          value={data.checks.late}
          currency={false}
          tone="bg-rose-50 text-rose-700"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          trend={
            data.checks.lateAmount > 0
              ? t("dashboard.kpiChecksLateAmount", {
                  amount: formatShekel(data.checks.lateAmount),
                })
              : t("dashboard.kpiChecksLateTrend")
          }
        />
        <KpiCard
          title={t("dashboard.kpiChecksThisWeek")}
          value={data.checks.thisWeek}
          currency={false}
          tone="bg-amber-50 text-amber-800"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          trend={
            data.checks.thisWeekAmount > 0
              ? t("dashboard.kpiChecksThisWeekAmount", {
                  amount: formatShekel(data.checks.thisWeekAmount),
                })
              : t("dashboard.kpiChecksThisWeekTrend")
          }
        />
        <KpiCard
          title={t("dashboard.kpiChecksFutureAmount")}
          value={data.checks.futureAmount}
          tone="bg-emerald-50 text-emerald-700"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          trend={t("dashboard.kpiChecksFutureTrend")}
        />
      </section>

      {/* גרף | התראות */}
      <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="flex flex-col rounded-[18px] border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="erp-section-title">{t("dashboard.chartTitle")}</h2>
            <p className="text-[13px] font-semibold text-slate-600 opacity-70">{t("dashboard.chartLast3")}</p>
          </div>
          <div className="erp-table-scroll mt-4 border-b border-slate-100 pb-2">
            <div className="flex min-h-0 min-w-[280px] gap-3" style={{ height: CHART_TOTAL_H }}>
            {data.chart.map((m) => (
              <div
                key={m.label}
                className="flex min-h-0 min-w-[72px] flex-1 flex-col items-center justify-end gap-2"
              >
                <div className="flex w-full min-h-0 flex-1 items-end justify-center gap-1">
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-emerald-500"
                    style={{ height: `${Math.max(5, (m.income / maxChart) * 100)}%` }}
                    title={t("dashboard.chartBarIncomeTitle", { amount: formatShekel(m.income) })}
                  />
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-rose-500"
                    style={{ height: `${Math.max(5, (m.expenses / maxChart) * 100)}%` }}
                    title={t("dashboard.chartBarExpensesTitle", { amount: formatShekel(m.expenses) })}
                  />
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-luxury-gold"
                    style={{ height: `${Math.max(5, (Math.max(0, m.profit) / maxChart) * 100)}%` }}
                    title={t("dashboard.chartBarProfitTitle", { amount: formatShekel(m.profit) })}
                  />
                </div>
                <span className="shrink-0 text-[13px] font-bold text-slate-600 opacity-80">{m.label}</span>
              </div>
            ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[13px] font-semibold text-slate-600 opacity-80">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden /> {t("dashboard.chartLegendIncome")}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden /> {t("dashboard.chartLegendExpenses")}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-luxury-gold" aria-hidden /> {t("dashboard.chartLegendProfit")}
            </span>
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200/90 bg-white p-4 shadow-sm">
          <h2 className="erp-section-title">{t("dashboard.alertsTitle")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/ops/inventory"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-rose-100 bg-rose-50/90 px-3 py-2.5 transition hover:border-rose-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-rose-800">
                <Package className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                {t("dashboard.shortageTitle")}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {data.shortageRows.length > 0
                  ? t("dashboard.shortageDetail", {
                      count: data.shortageRows.length,
                      qty: Math.abs(data.shortageRows[0].diff),
                      name: data.shortageRows[0].name,
                    })
                  : t("dashboard.shortageOk")}
              </p>
            </Link>
          <Link
              href="/finance/ledgers"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-amber-100 bg-amber-50/90 px-3 py-2.5 transition hover:border-amber-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {t("dashboard.openInvoicesTitle")}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {t("dashboard.openInvoicesDetail", { count: data.openInvoices })}
              </p>
          </Link>
          <Link
              href="/admin/tasks"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-violet-100 bg-violet-50/90 px-3 py-2.5 transition hover:border-violet-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-violet-800">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                {t("dashboard.urgentTasksTitle")}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {t("dashboard.urgentTasksDetail", { count: data.urgentTaskCount })}
              </p>
          </Link>
            {data.futureOrderAlerts.map((a) => (
              <Link
                key={`${a.kind}-${a.detail}`}
                href={a.href}
                className={`flex min-h-0 flex-col justify-center rounded-[16px] border px-3 py-2.5 transition hover:opacity-95 ${
                  a.kind === "soon"
                    ? "border-cyan-200 bg-cyan-50/90"
                    : a.kind === "no_deposit"
                      ? "border-orange-200 bg-orange-50/90"
                      : "border-amber-200 bg-amber-50/90"
                }`}
              >
                <p
                  className={`flex items-center gap-2 text-[13px] font-extrabold ${
                    a.kind === "soon"
                      ? "text-cyan-900"
                      : a.kind === "no_deposit"
                        ? "text-orange-950"
                        : "text-amber-950"
                  }`}
                >
                  <CalendarClock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {a.kind === "soon"
                    ? t("dashboard.alertKindSoon")
                    : a.kind === "no_deposit"
                      ? t("dashboard.alertKindNoDeposit")
                      : t("dashboard.alertKindBalance")}
                </p>
                <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">{a.detail}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
