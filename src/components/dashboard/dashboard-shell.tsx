"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardSummary } from "@/lib/dashboard/summary";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ExpenseCategoryCards } from "@/components/dashboard/expense-category-cards";
import { ZCashCards } from "@/components/dashboard/z-cash-cards";
import { WeddingOrderCards } from "@/components/dashboard/wedding-order-cards";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { ProfitAnalyticsChart } from "@/components/dashboard/profit-analytics-chart";
import { TasksPerformanceChart } from "@/components/dashboard/tasks-performance-chart";
import { SupplierPaymentsChart } from "@/components/dashboard/supplier-payments-chart";
import { DashboardSummaryStrip } from "@/components/dashboard/dashboard-summary-strip";

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100 ${className ?? ""}`}
    />
  );
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
      <div className="flex flex-col gap-4 p-1">
        <ShimmerBlock className="h-24" />
        <div className="grid gap-3 lg:grid-cols-4">
          <ShimmerBlock className="h-64 lg:col-span-2" />
          <ShimmerBlock className="h-64" />
          <ShimmerBlock className="h-64" />
        </div>
        <ShimmerBlock className="h-48" />
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
          className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white"
        >
          {t("dashboard.redesign.refresh")}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="tcg-fade-in flex flex-col gap-4">
      {data.dbUnavailable ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {t("dashboard.dbUnavailableTitle")} — {t("dashboard.dbUnavailableHint")}
        </div>
      ) : null}

      <DashboardHeader updatedAt={data.updatedAt} loading={loading} onRefresh={() => void load()} />

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <ExpenseCategoryCards cards={data.expensesByType} />
        <ZCashCards data={data.zCash} />
        <WeddingOrderCards data={data.weddings} />
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AlertsPanel alerts={data.alerts} />
        <div className="flex flex-col gap-3">
          <ProfitAnalyticsChart data={data.dailyChart} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TasksPerformanceChart data={data.tasksChart} />
            <SupplierPaymentsChart data={data.supplierChart} />
          </div>
        </div>
      </section>

      <DashboardSummaryStrip strip={data.strip} />
    </div>
  );
}
