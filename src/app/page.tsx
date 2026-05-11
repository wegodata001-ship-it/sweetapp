import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ClipboardCheck,
  Package,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/count-up";
import { formatShekel } from "@/lib/format-shekel";
import { prisma, getEmployeeTaskOrm } from "@/lib/prisma";

type FinanceDoc = {
  category: string;
  totalAmount: number;
  depositAmount: number | null;
  remainingAmount: number;
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

function trendLabel(current: number, previous: number) {
  const diff = current - previous;
  if (Math.abs(diff) < 1) return "ללא שינוי מחודש קודם";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${formatShekel(Math.abs(diff))} מחודש קודם`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("he-IL", { month: "short" });
}

async function getDashboardData() {
  const nowStart = monthStart(0);
  const nowEnd = monthEnd(0);
  const prevStart = monthStart(-1);
  const prevEnd = monthEnd(-1);
  const chartStart = monthStart(-3);

  const [docs, supplierRows, employeeRows, ledgerRows, openTaskCount, urgentTaskCount, inventoryProducts] =
    await Promise.all([
      prisma.financialDocument.findMany({
        where: {
          category: { in: ["הכנסה", "הוצאה"] },
          OR: [
            { docDate: { gte: chartStart } },
            { docDate: null, createdAt: { gte: chartStart } },
            { remainingAmount: { gt: 0 } },
          ],
        },
        select: {
          category: true,
          totalAmount: true,
          depositAmount: true,
          remainingAmount: true,
          docDate: true,
          createdAt: true,
        },
      }),
      prisma.supplier.findMany({ select: { id: true, openingBalance: true } }),
      prisma.employee.findMany({ select: { id: true, openingBalance: true } }),
      prisma.ledgerEntry.findMany({
        select: { supplierId: true, employeeId: true, debit: true, credit: true },
      }),
      getEmployeeTaskOrm().count({ where: { status: { not: "completed" } } }),
      getEmployeeTaskOrm().count({
        where: { priority: "urgent", status: { not: "completed" } },
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

  const financeDocs = docs as FinanceDoc[];
  const income = sumDocs(financeDocs, "הכנסה", nowStart, nowEnd);
  const expenses = sumDocs(financeDocs, "הוצאה", nowStart, nowEnd);
  const prevIncome = sumDocs(financeDocs, "הכנסה", prevStart, prevEnd);
  const prevExpenses = sumDocs(financeDocs, "הוצאה", prevStart, prevEnd);
  const profit = income - expenses;
  const prevProfit = prevIncome - prevExpenses;

  const openCustomerBalance = financeDocs.reduce(
    (sum, doc) =>
      doc.category === "הכנסה" ? sum + Math.max(0, doc.remainingAmount) : sum,
    0,
  );
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

  const openInvoices = financeDocs.filter((doc) => doc.category === "הכנסה" && doc.remainingAmount > 0).length;
  const shortageRows = inventoryProducts
    .map((item) => ({ name: item.name, diff: item.counts[0]?.difference ?? 0 }))
    .filter((item) => item.diff < 0)
    .sort((a, b) => a.diff - b.diff);

  const chart = Array.from({ length: 3 }, (_, idx) => {
    const offset = idx - 2;
    const d = monthStart(offset);
    const from = monthStart(offset);
    const to = monthEnd(offset);
    const monthIncome = sumDocs(financeDocs, "הכנסה", from, to);
    const monthExpenses = sumDocs(financeDocs, "הוצאה", from, to);
    return {
      label: monthLabel(d),
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
  const data = await getDashboardData();
  const maxChart = Math.max(
    1,
    ...data.chart.flatMap((m) => [m.income, m.expenses, Math.max(0, m.profit)]),
  );

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-2.5 pb-2 pt-0" dir="rtl">
      {/* Hero — ERP compact */}
      <section className="relative flex min-h-0 flex-col justify-center overflow-hidden rounded-[18px] border border-luxury-gold/20 bg-gradient-to-br from-luxury-navy-rich via-luxury-charcoal to-slate-950 px-8 py-7 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-luxury-gold/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-16 right-12 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="relative z-[1] min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white/80">מרכז ניהול</p>
          <h1 className="mt-1 text-[clamp(2rem,2.6vw,2.625rem)] font-black leading-[1.1] tracking-tight text-white">
            סקירה עסקית
          </h1>
          <p className="mt-1.5 max-w-md text-[15px] leading-snug text-white/80">
            הכנסות, הוצאות, רווח ויתרות — במבט אחד.
          </p>
        </div>

        <div className="relative z-[1] mt-6 flex w-full flex-shrink-0 flex-col gap-4 sm:flex-row sm:items-end lg:mt-0 lg:w-auto lg:min-w-[320px]">
          <div className="rounded-[18px] border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
            <p className="text-[13px] font-semibold text-white/70">רווח נקי החודש</p>
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
              <p className="text-[13px] font-semibold text-emerald-200/90 opacity-90">הכנסות</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.income)}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-rose-400/20 bg-rose-500/10 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-rose-200/90 opacity-90">הוצאות</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.expenses)}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-luxury-gold/25 bg-luxury-gold/10 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-luxury-gold/90 opacity-90">רווח</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{formatShekel(data.profit)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard
          title="הכנסות החודש"
          value={data.income}
          tone="bg-emerald-50 text-emerald-700"
          icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
          trend={trendLabel(data.income, data.prevIncome)}
        />
        <KpiCard
          title="הוצאות החודש"
          value={data.expenses}
          tone="bg-rose-50 text-rose-700"
          icon={<ArrowDownRight className="h-4 w-4" aria-hidden />}
          trend={trendLabel(data.expenses, data.prevExpenses)}
        />
        <KpiCard
          title="יתרות פתוחות"
          value={data.openBalances}
          tone="bg-blue-50 text-blue-700"
          icon={<WalletCards className="h-4 w-4" aria-hidden />}
          trend="לקוחות, ספקים ועובדים"
        />
        <KpiCard
          title="משימות פתוחות"
          value={data.openTaskCount}
          currency={false}
          tone="bg-amber-50 text-amber-800"
          icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
          trend="לא הושלמו"
        />
      </section>

      {/* גרף | התראות */}
      <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="flex flex-col rounded-[18px] border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="erp-section-title">רווח מול הכנסות והוצאות</h2>
            <p className="text-[13px] font-semibold text-slate-600 opacity-70">3 חודשים אחרונים</p>
          </div>
          <div className="mt-4 flex gap-3 border-b border-slate-100 pb-2" style={{ height: CHART_TOTAL_H }}>
            {data.chart.map((m) => (
              <div
                key={m.label}
                className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <div className="flex w-full min-h-0 flex-1 items-end justify-center gap-1">
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-emerald-500"
                    style={{ height: `${Math.max(5, (m.income / maxChart) * 100)}%` }}
                    title={`הכנסות ${formatShekel(m.income)}`}
                  />
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-rose-500"
                    style={{ height: `${Math.max(5, (m.expenses / maxChart) * 100)}%` }}
                    title={`הוצאות ${formatShekel(m.expenses)}`}
                  />
                  <span
                    className="w-2.5 max-w-[18%] rounded-t-md bg-luxury-gold"
                    style={{ height: `${Math.max(5, (Math.max(0, m.profit) / maxChart) * 100)}%` }}
                    title={`רווח ${formatShekel(m.profit)}`}
                  />
                </div>
                <span className="shrink-0 text-[13px] font-bold text-slate-600 opacity-80">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[13px] font-semibold text-slate-600 opacity-80">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden /> הכנסות
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden /> הוצאות
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-luxury-gold" aria-hidden /> רווח
            </span>
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200/90 bg-white p-4 shadow-sm">
          <h2 className="erp-section-title">התראות חשובות</h2>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/ops/inventory"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-rose-100 bg-rose-50/90 px-3 py-2.5 transition hover:border-rose-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-rose-800">
                <Package className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                חסר מלאי
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {data.shortageRows.length > 0
                  ? `${data.shortageRows.length} פריטים בחוסר · ${Math.abs(data.shortageRows[0].diff)} ${data.shortageRows[0].name}`
                  : "אין חוסרים בספירה האחרונה"}
              </p>
            </Link>
          <Link
              href="/finance/ledgers"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-amber-100 bg-amber-50/90 px-3 py-2.5 transition hover:border-amber-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                חשבוניות פתוחות
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {data.openInvoices} חשבוניות פתוחות לגבייה
              </p>
          </Link>
          <Link
              href="/admin/tasks"
              className="flex min-h-0 flex-col justify-center rounded-[16px] border border-violet-100 bg-violet-50/90 px-3 py-2.5 transition hover:border-violet-200"
            >
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-violet-800">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                משימות דחופות
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800 opacity-90">
                {data.urgentTaskCount} משימות דחופות לטיפול
              </p>
          </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
