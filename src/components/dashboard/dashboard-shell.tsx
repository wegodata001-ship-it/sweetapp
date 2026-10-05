"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardHeroSlice, DashboardSummary } from "@/lib/dashboard/summary";
import { fetchWithDedupe } from "@/lib/client/fetch-cache";
import {
  dashboardCacheKey,
  dashboardPeriodSearch,
  defaultDashboardPeriod,
  formatCustomPeriodLabel,
  localizedMonthName,
  parseDashboardPeriodSearch,
  type DashboardPeriodSelection,
} from "@/lib/dashboard/dashboard-period";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ExpenseCategoryCards } from "@/components/dashboard/expense-category-cards";
import { ZReportCards } from "@/components/dashboard/z-report-cards";
import { WeddingOverviewCards } from "@/components/dashboard/wedding-overview-cards";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { MyNotesWidget } from "@/components/my-notes/my-notes-widget";
import { FinancialAnalyticsChart } from "@/components/dashboard/financial-analytics-chart";
import { TasksPerformanceChart } from "@/components/dashboard/tasks-performance-chart";
import { SupplierPaymentsChart } from "@/components/dashboard/supplier-payments-chart";
import pageStyles from "./dashboard-premium.module.css";

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-300/50 ${className ?? ""}`} />;
}

const CACHE_MS = 20_000;

function writePeriodUrl(selection: DashboardPeriodSelection) {
  if (typeof window === "undefined") return;
  const qs = dashboardPeriodSearch(selection);
  const next = qs ? `/?${qs}` : "/";
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, "", next);
  }
}

function summaryQuery(selection: DashboardPeriodSelection, section?: "hero"): string {
  const qs = new URLSearchParams();
  if (section) qs.set("section", section);
  qs.set("period", selection.period);
  if (selection.period === "custom") {
    qs.set("from", selection.from);
    qs.set("to", selection.to);
  }
  return `/api/dashboard/summary?${qs.toString()}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function DashboardShell() {
  const { t, bcp47 } = useI18n();
  const [selection, setSelection] = useState<DashboardPeriodSelection>(defaultDashboardPeriod);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [heroReady, setHeroReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const fetchKey =
    selection.period === "custom" ? `custom:${selection.from}:${selection.to}` : "preset";

  const load = useCallback(async (opts?: {
    force?: boolean;
    isCancelled?: () => boolean;
    selection?: DashboardPeriodSelection;
  }) => {
    const cancelled = () => opts?.isCancelled?.() === true;
    const sel = opts?.selection ?? selectionRef.current;
    const heroKey = dashboardCacheKey("dashboard-hero", sel);
    const fullKey = dashboardCacheKey("dashboard-full", sel);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = (generationRef.current += 1);
    if (opts?.force) {
      const { invalidateCacheKey } = await import("@/lib/client/fetch-cache");
      invalidateCacheKey(heroKey);
      invalidateCacheKey(fullKey);
    }
    if (cancelled() || controller.signal.aborted) return;
    setError(null);
    setRefreshing(true);

    const heroPromise = fetchWithDedupe<DashboardHeroSlice | null>(
      heroKey,
      async () => {
        const res = await fetch(summaryQuery(sel, "hero"), {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const json = (await res.json()) as { ok: boolean; data?: DashboardHeroSlice };
        if (!res.ok || !json.ok || !json.data) return null;
        return json.data;
      },
      opts?.force ? 0 : CACHE_MS,
    );

    const fullPromise = fetchWithDedupe<DashboardSummary | null>(
      fullKey,
      async () => {
        const res = await fetch(summaryQuery(sel), {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const json = (await res.json()) as { ok: boolean; data?: DashboardSummary; error?: string };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? t("dashboard.redesign.loadError"));
        }
        return json.data;
      },
      opts?.force ? 0 : CACHE_MS,
    );

    // Both requests start together. A cancelled caller may return before the
    // second one settles, so each rejection needs its own handler.
    void heroPromise.catch(() => undefined);
    void fullPromise.catch(() => undefined);

    try {
      const hero = await heroPromise;
      if (cancelled() || generation !== generationRef.current) return;
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
                zPosCustom: { reportsToday: 0, cashToday: 0, cardToday: 0, checksToday: 0, otherToday: 0 },
                weddings: { weddings: 0, orders: 0, documented: 0 },
                weddingsByRange: {
                  today: { weddings: 0, orders: 0, documented: 0 },
                  week: { weddings: 0, orders: 0, documented: 0 },
                  month: { weddings: 0, orders: 0, documented: 0 },
                },
                weddingsCustom: { weddings: 0, orders: 0, documented: 0 },
                customPeriod: hero.customPeriod ?? null,
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
      if (cancelled() || generation !== generationRef.current) return;
      if (full) {
        setData(full);
        setBodyReady(true);
      }
    } catch (error) {
      if (cancelled() || isAbortError(error)) return;
      if (!heroReady) setError(t("dashboard.redesign.loadError"));
    } finally {
      if (!cancelled()) setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    const next = parseDashboardPeriodSearch(new URLSearchParams(window.location.search));
    setSelection(next);
    writePeriodUrl(next);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void load({ isCancelled: () => cancelled, selection: selectionRef.current });
    return () => {
      cancelled = true;
    };
  }, [hydrated, fetchKey, load]);

  const periodLabel = useMemo(() => {
    if (selection.period === "today") return t("dashboard.redesign.filter.today");
    if (selection.period === "week") return t("dashboard.redesign.filter.week");
    if (selection.period === "custom") return formatCustomPeriodLabel(selection.from, selection.to, bcp47);
    return `${t("dashboard.redesign.filter.month")} · ${localizedMonthName(new Date(), bcp47)}`;
  }, [bcp47, selection, t]);

  useLiveRefresh({
    refresh: () => load({ force: true }),
    scope: "finance",
    intervalMs: 0,
  });

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
        customPeriod={data.customPeriod}
        selection={selection}
        onSelectionChange={(next) => {
          setSelection(next);
          writePeriodUrl(next);
        }}
        updatedAt={data.updatedAt}
        loading={refreshing}
        onRefresh={() => void load({ force: true, selection })}
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
              <ExpenseCategoryCards
                cards={data.expensesByType}
                period={selection.period}
                periodLabel={periodLabel}
              />
            </div>
            <ZReportCards
              dataByRange={data.zPosByRange}
              custom={data.zPosCustom}
              period={selection.period}
              periodLabel={periodLabel}
            />
            <WeddingOverviewCards
              dataByRange={data.weddingsByRange}
              custom={data.weddingsCustom}
              period={selection.period}
              periodLabel={periodLabel}
            />
          </section>

          <section className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(260px,300px)_minmax(260px,300px)_1fr]">
            <AlertsPanel alerts={data.alerts} />
            <MyNotesWidget />
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
