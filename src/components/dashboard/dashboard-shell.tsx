"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardSummary } from "@/lib/dashboard/summary";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ExpenseCategoryCards } from "@/components/dashboard/expense-category-cards";
import { ZReportCards } from "@/components/dashboard/z-report-cards";
import { WeddingOverviewCards } from "@/components/dashboard/wedding-overview-cards";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { FinancialAnalyticsChart } from "@/components/dashboard/financial-analytics-chart";
import { TasksPerformanceChart } from "@/components/dashboard/tasks-performance-chart";
import { SupplierPaymentsChart } from "@/components/dashboard/supplier-payments-chart";
import pageStyles from "./dashboard-premium.module.css";

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-300/50 ${className ?? ""}`} />;
}

export function DashboardShell() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; data?: DashboardSummary; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? t("dashboard.redesign.loadError"));
        return;
      }
      setData(json.data);
    } catch {
      setError(t("dashboard.redesign.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className={`${pageStyles.pageBg} flex flex-col gap-2 p-0.5`}>
        <Shimmer className="h-52 rounded-3xl" />
        <div className="grid gap-2 lg:grid-cols-4">
          <Shimmer className="h-36 lg:col-span-2" />
          <Shimmer className="h-36" />
          <Shimmer className="h-36" />
        </div>
        <Shimmer className="h-72 rounded-3xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-bold text-rose-900">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white"
        >
          {t("dashboard.redesign.refresh")}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={`${pageStyles.pageBg} tcg-fade-in flex flex-col gap-2`}>
      {data.dbUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
          {t("dashboard.dbUnavailableTitle")}
        </div>
      ) : null}

      <DashboardHero
        todayPnl={data.todayPnl}
        monthPnl={data.monthPnl}
        updatedAt={data.updatedAt}
        loading={loading}
        onRefresh={() => void load()}
      />

      <section className="grid grid-cols-1 gap-2 lg:grid-cols-4 lg:items-stretch">
        <div className="lg:col-span-2">
          <ExpenseCategoryCards cards={data.expensesByType} />
        </div>
        <ZReportCards data={data.zPos} />
        <WeddingOverviewCards data={data.weddings} />
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(260px,300px)_1fr]">
        <AlertsPanel alerts={data.alerts} />
        <div className="flex min-w-0 flex-col gap-2">
          <FinancialAnalyticsChart data={data.dailyChart} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <TasksPerformanceChart data={data.tasksChart} />
            <SupplierPaymentsChart data={data.supplierPayments} />
          </div>
        </div>
      </section>
    </div>
  );
}
