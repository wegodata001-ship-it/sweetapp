"use client";

import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardSummary } from "@/lib/dashboard/summary";

export function DashboardSummaryStrip({ strip }: { strip: DashboardSummary["strip"] }) {
  const { t } = useI18n();
  const items = [
    { key: "netProfit", value: strip.netProfit, currency: true },
    { key: "totalIncome", value: strip.totalIncome, currency: true },
    { key: "totalExpenses", value: strip.totalExpenses, currency: true },
    { key: "totalOperations", value: strip.totalOperations, currency: false },
    { key: "newCustomers", value: strip.newCustomers, currency: false },
    { key: "overdueTasks", value: strip.overdueTasks, currency: false },
  ] as const;

  const labels: Record<(typeof items)[number]["key"], string> = {
    netProfit: "dashboard.redesign.stripNetProfit",
    totalIncome: "dashboard.redesign.stripIncome",
    totalExpenses: "dashboard.redesign.stripExpenses",
    totalOperations: "dashboard.redesign.stripOps",
    newCustomers: "dashboard.redesign.stripCustomers",
    overdueTasks: "dashboard.redesign.stripOverdue",
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-gradient-to-l from-[#081224] via-slate-900 to-[#0f2744] p-3 text-white shadow-lg sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.key} className="rounded-xl bg-white/5 px-2 py-2 text-center backdrop-blur-sm">
          <p className="text-[10px] font-bold text-slate-300">{t(labels[item.key])}</p>
          <p className="mt-1 text-sm font-black text-[#f5e6b8] lg:text-base">
            <CountUp value={item.value} currency={item.currency} />
          </p>
        </div>
      ))}
    </div>
  );
}
