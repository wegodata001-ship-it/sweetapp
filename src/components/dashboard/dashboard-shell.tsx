"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardHeroSlice, DashboardSummary } from "@/lib/dashboard/summary";
import { fetchWithDedupe } from "@/lib/client/fetch-cache";
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

const HERO_KEY = "dashboard-hero";
const FULL_KEY = "dashboard-full";
const CACHE_MS = 20_000;

export function DashboardShell() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [heroReady, setHeroReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (opts?.force) {
      const { invalidateCacheKey } = await import("@/lib/client/fetch-cache");
      invalidateCacheKey(HERO_KEY);
      invalidateCacheKey(FULL_KEY);
    }
    setError(null);
    setRefreshing(true);

    const heroPromise = fetchWithDedupe<DashboardHeroSlice | null>(
      HERO_KEY,
      async () => {
        const res = await fetch("/api/dashboard/summary?section=hero", {
          credentials: "same-origin",
        });
        const json = (await res.json()) as { ok: boolean; data?: DashboardHeroSlice };
        if (!res.ok || !json.ok || !json.data) return null;
        return json.data;
      },
      opts?.force ? 0 : CACHE_MS,
    );

    const fullPromise = fetchWithDedupe<DashboardSummary | null>(
      FULL_KEY,
      async () => {
        const res = await fetch("/api/dashboard/summary", { credentials: "same-origin" });
        const json = (await res.json()) as { ok: boolean; data?: DashboardSummary; error?: string };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? t("dashboard.redesign.loadError"));
        }
        return json.data;
      },
      opts?.force ? 0 : CACHE_MS,
    );

    try {
      const hero = await heroPromise;
      if (hero) {
        setData((prev) =>
          prev
            ? { ...prev, ...hero }
            : ({
                ...hero,
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
                dailyChart: [],
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
              } as DashboardSummary),
        );
        setHeroReady(true);
      }

      const full = await fullPromise;
      if (full) {
        setData(full);
        setBodyReady(true);
      }
    } catch {
      if (!heroReady) setError(t("dashboard.redesign.loadError"));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!heroReady && !data) {
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
          onClick={() => void load({ force: true })}
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
        hero={data.heroMetrics}
        updatedAt={data.updatedAt}
        loading={refreshing}
        onRefresh={() => void load({ force: true })}
      />

      {!bodyReady ? (
        <>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
            <Shimmer className="h-36 lg:col-span-2" />
            <Shimmer className="h-36" />
            <Shimmer className="h-36" />
          </div>
          <Shimmer className="h-72 rounded-3xl" />
        </>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-2 lg:grid-cols-4 lg:items-stretch">
            <div className="lg:col-span-2">
              <ExpenseCategoryCards cards={data.expensesByType} />
            </div>
            <ZReportCards dataByRange={data.zPosByRange} />
            <WeddingOverviewCards dataByRange={data.weddingsByRange} />
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
        </>
      )}
    </div>
  );
}
