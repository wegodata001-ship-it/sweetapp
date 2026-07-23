"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/components/i18n-provider";
import type {
  AnalyticsDashboardDto,
  AnalyticsDrillRow,
  AnalyticsDrillType,
  AnalyticsRange,
} from "@/lib/inventory/analytics-types";

const PIE_COLORS = ["#6c4cff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

type DrillState = { type: AnalyticsDrillType; title: string } | null;

function KpiCard({
  label,
  value,
  onClick,
  tone = "default",
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
  tone?: "default" | "danger" | "ok" | "warn";
}) {
  const toneCls =
    tone === "danger"
      ? "ring-rose-200 bg-rose-50 text-rose-800"
      : tone === "ok"
        ? "ring-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "warn"
          ? "ring-amber-200 bg-amber-50 text-amber-900"
          : "ring-[#e7ecf5] bg-white text-slate-900";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`min-w-0 rounded-2xl p-3 text-start ring-1 shadow-sm ${toneCls} ${
        onClick ? "transition hover:brightness-95 active:scale-[0.99]" : ""
      }`}
    >
      <p className="text-[11px] font-bold opacity-70">{label}</p>
      <p className="mt-1 truncate text-xl font-black tabular-nums">{value}</p>
    </Comp>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#e7ecf5] bg-white/95 p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-900 sm:text-base">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProductList({
  items,
  empty,
}: {
  items: { id: string; name: string; quantity: number; meta?: string }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm font-semibold text-slate-400">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item, idx) => (
        <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
            <span className="ml-2 text-xs font-bold text-slate-400">{idx + 1}.</span>
            {item.name}
          </span>
          <span className="shrink-0 font-black tabular-nums text-slate-900">
            {item.quantity}
            {item.meta ? (
              <span className="mr-1 text-[10px] font-bold text-slate-400">{item.meta}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Heatmap({ cells, t }: { cells: { day: number; hour: number; value: number }[]; t: (k: string) => string }) {
  /** 6 בלוקים של 4 שעות — בלי גלילה אופקית במובייל */
  const buckets = [0, 4, 8, 12, 16, 20];
  const agg = new Map<string, number>();
  for (const c of cells) {
    const b = Math.floor(c.hour / 4) * 4;
    const key = `${c.day}-${b}`;
    agg.set(key, (agg.get(key) ?? 0) + c.value);
  }
  const max = Math.max(1, ...agg.values());
  const days = [0, 1, 2, 3, 4, 5, 6];
  const dayLabels = [
    t("heatSun"),
    t("heatMon"),
    t("heatTue"),
    t("heatWed"),
    t("heatThu"),
    t("heatFri"),
    t("heatSat"),
  ];

  return (
    <div className="w-full">
      <div className="mb-1 grid grid-cols-[2rem_repeat(6,minmax(0,1fr))] gap-1 text-[9px] font-bold text-slate-400">
        <span />
        {buckets.map((h) => (
          <span key={h} className="text-center">
            {h}
          </span>
        ))}
      </div>
      {days.map((d) => (
        <div
          key={d}
          className="mb-1 grid grid-cols-[2rem_repeat(6,minmax(0,1fr))] gap-1"
        >
          <span className="text-[10px] font-bold text-slate-500">{dayLabels[d]}</span>
          {buckets.map((h) => {
            const v = agg.get(`${d}-${h}`) ?? 0;
            const alpha = v === 0 ? 0.06 : 0.15 + (v / max) * 0.85;
            return (
              <div
                key={h}
                title={`${dayLabels[d]} ${h}:00 — ${v}`}
                className="h-7 rounded-md sm:h-8"
                style={{ background: `rgba(108, 76, 255, ${alpha})` }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function InventoryAnalyticsDashboard() {
  const { t: T, dir } = useI18n();
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      T(`ops.inventory.analytics.${key}`, vars),
    [T],
  );

  const [range, setRange] = useState<AnalyticsRange>("month");
  const [locationId, setLocationId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<AnalyticsDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [drill, setDrill] = useState<DrillState>(null);
  const [drillRows, setDrillRows] = useState<AnalyticsDrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [trendTab, setTrendTab] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");

  const query = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (locationId) p.set("locationId", locationId);
    if (workerId) p.set("workerId", workerId);
    if (category) p.set("category", category);
    return p.toString();
  }, [range, locationId, workerId, category]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/analytics?${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        data?: AnalyticsDashboardDto;
        error?: string;
        meta?: { ms?: number };
      };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? t("loadFailed"));
        setData(null);
        return;
      }
      setData(j.data);
      setLoadMs(j.meta?.ms ?? null);
    } catch {
      setError(t("loadFailed"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDrill = async (type: AnalyticsDrillType, title: string) => {
    setDrill({ type, title });
    setDrillLoading(true);
    setDrillRows([]);
    try {
      const res = await fetch(`/api/inventory/analytics/drill?type=${type}&${query}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: AnalyticsDrillRow[] };
      setDrillRows(j.data ?? []);
    } finally {
      setDrillLoading(false);
    }
  };

  const exportFile = (format: "xlsx" | "csv") => {
    window.open(`/api/inventory/analytics/export?format=${format}&${query}`, "_blank");
  };

  const trendData = data?.usage[trendTab] ?? [];
  const pieAccuracy = data
    ? [
        { name: t("match"), value: Math.max(0, data.kpis.avgAccuracyPct) },
        { name: t("gap"), value: Math.max(0, 100 - data.kpis.avgAccuracyPct) },
      ]
    : [];

  const selectCls =
    "h-10 w-full rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold outline-none focus:border-[#6c4cff] sm:w-auto";

  return (
    <div className="space-y-4" dir={dir}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/ops/inventory"
            className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-[#6c4cff]"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180 rtl:rotate-0" />
            {t("backToInventory")}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <BarChart3 className="h-6 w-6 text-[#6c4cff]" />
            {t("title")}
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{t("subtitle")}</p>
          {loadMs != null ? (
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              {t("loadedIn", { ms: loadMs })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-black text-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
          <button
            type="button"
            onClick={() => exportFile("xlsx")}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-black text-slate-700"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportFile("csv")}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-black text-slate-700"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-2 rounded-[20px] border border-[#e7ecf5] bg-white/90 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as AnalyticsRange)}
          className={selectCls}
        >
          <option value="day">{t("rangeDay")}</option>
          <option value="week">{t("rangeWeek")}</option>
          <option value="month">{t("rangeMonth")}</option>
          <option value="year">{t("rangeYear")}</option>
        </select>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("filterLocationAll")}</option>
          {(data?.meta.locations ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("filterWorkerAll")}</option>
          {(data?.meta.workers ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("filterCategoryAll")}</option>
          {(data?.meta.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#6c4cff]" />
        </div>
      ) : error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label={t("kpiProducts")} value={data.kpis.totalProducts} />
            <KpiCard
              label={t("kpiLocations")}
              value={data.kpis.totalLocations}
              onClick={() => void openDrill("locations", t("kpiLocations"))}
            />
            <KpiCard
              label={t("kpiCounts")}
              value={data.kpis.totalCounts}
              onClick={() => void openDrill("counts", t("kpiCounts"))}
            />
            <KpiCard
              label={t("kpiActive")}
              value={data.kpis.activeCounts}
              tone="warn"
              onClick={() => void openDrill("activeLocations", t("kpiActive"))}
            />
            <KpiCard label={t("kpiAccuracy")} value={`${data.kpis.avgAccuracyPct}%`} tone="ok" />
            <KpiCard
              label={t("kpiShortage")}
              value={data.kpis.shortageProducts}
              tone="danger"
              onClick={() => void openDrill("shortages", t("kpiShortage"))}
            />
            <KpiCard
              label={t("kpiSurplus")}
              value={data.kpis.surplusProducts}
              onClick={() => void openDrill("surpluses", t("kpiSurplus"))}
            />
            <KpiCard label={t("kpiUnits")} value={data.kpis.totalUnits} />
            <KpiCard
              label={t("kpiUncounted30")}
              value={data.kpis.uncountedOver30Days}
              tone="warn"
              onClick={() => void openDrill("uncounted", t("kpiUncounted30"))}
            />
            <KpiCard
              label={t("kpiAvgDuration")}
              value={
                data.kpis.avgCountDurationMinutes != null
                  ? `${data.kpis.avgCountDurationMinutes} ${t("minutes")}`
                  : "—"
              }
            />
          </div>

          <Section
            title={t("usageTrends")}
            action={
              <div className="flex flex-wrap gap-1">
                {(["daily", "weekly", "monthly", "yearly"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTrendTab(tab)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                      trendTab === tab
                        ? "bg-[#6c4cff] text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t(`trend_${tab}`)}
                  </button>
                ))}
              </div>
            }
          >
            <div className="h-56 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf5" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    name={t("usage")}
                    stroke="#6c4cff"
                    fill="#6c4cff33"
                  />
                  <Area
                    type="monotone"
                    dataKey="surplus"
                    name={t("surplus")}
                    stroke="#10b981"
                    fill="#10b98122"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf5" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="counts"
                    name={t("countEvents")}
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title={t("topMostUsed")}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProducts.mostUsed.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf5" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip />
                    <Bar dataKey="quantity" name={t("usage")} fill="#6c4cff" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title={t("accuracyPie")}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieAccuracy} dataKey="value" nameKey="name" outerRadius={80} label>
                      {pieAccuracy.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Section title={t("topLeastUsed")}>
              <ProductList items={data.topProducts.leastUsed} empty={t("empty")} />
            </Section>
            <Section title={t("topNoMovement")}>
              <ProductList items={data.topProducts.noMovement} empty={t("empty")} />
            </Section>
            <Section title={t("topAnomalous")}>
              <ProductList items={data.topProducts.anomalous} empty={t("empty")} />
            </Section>
            <Section title={t("topNearMin")}>
              <ProductList items={data.topProducts.nearMinimum} empty={t("empty")} />
            </Section>
          </div>

          <Section title={t("workersTitle")}>
            <div className="mb-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.workers.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip />
                  <Bar dataKey="accuracyPct" name={t("kpiAccuracy")} fill="#10b981" radius={4} />
                  <Bar dataKey="unitsCounted" name={t("unitsCounted")} fill="#6c4cff" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="py-2 font-bold">{t("colWorker")}</th>
                    <th className="py-2 font-bold">{t("colProducts")}</th>
                    <th className="py-2 font-bold">{t("colUnits")}</th>
                    <th className="py-2 font-bold">{t("colDiffs")}</th>
                    <th className="py-2 font-bold">{t("kpiAccuracy")}</th>
                    <th className="py-2 font-bold">{t("colAreas")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map((w) => (
                    <tr key={w.id} className="border-b border-slate-50">
                      <td className="py-2 font-semibold">{w.name}</td>
                      <td className="py-2 tabular-nums">{w.productsCounted}</td>
                      <td className="py-2 tabular-nums">{w.unitsCounted}</td>
                      <td className="py-2 tabular-nums">{w.diffCount}</td>
                      <td className="py-2 tabular-nums">{w.accuracyPct}%</td>
                      <td className="py-2">{w.areaCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.workers.length === 0 ? (
                <p className="py-6 text-center text-sm font-semibold text-slate-400">{t("emptyWorkers")}</p>
              ) : null}
            </div>
          </Section>

          <Section title={t("locationsTitle")}>
            <div className="space-y-2">
              {data.locations.map((loc) => (
                <div
                  key={loc.id}
                  className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-100"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-slate-900">{loc.name}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {loc.lastCountedAt
                        ? new Date(loc.lastCountedAt).toLocaleString()
                        : t("neverCounted")}
                      {loc.lastCountedBy ? ` · ${loc.lastCountedBy}` : ""}
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4">
                    <span>{t("colProducts")}: {loc.productCount}</span>
                    <span className="text-rose-600">{t("kpiShortage")}: {loc.shortageCount}</span>
                    <span className="text-emerald-700">{t("kpiSurplus")}: {loc.surplusCount}</span>
                    <span>{t("kpiAccuracy")}: {loc.accuracyPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("forecastTitle")}>
            <div className="space-y-2">
              {data.forecast.slice(0, 15).map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-[#e7ecf5] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-slate-900">{f.name}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {t("stock")}: {f.currentQty} · {t("dailyUsage")}: {f.dailyUsage}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {f.daysLeft != null
                      ? t("coversDays", { d: f.daysLeft })
                      : t("noUsageSignal")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-black">
                    <span className={`rounded-full px-2 py-0.5 ${f.covers3d ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      3d
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${f.covers7d ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      7d
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${f.covers30d ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      30d
                    </span>
                  </div>
                  {f.orderInDays != null && f.daysLeft != null && f.daysLeft < 14 ? (
                    <p className="mt-2 text-xs font-black text-amber-700">
                      {t("orderInDays", { d: f.orderInDays })}
                    </p>
                  ) : null}
                </div>
              ))}
              {data.forecast.length === 0 ? (
                <p className="py-6 text-center text-sm font-semibold text-slate-400">
                  {t("emptyForecast")}
                </p>
              ) : null}
            </div>
          </Section>

          <Section title={t("criticalTitle")}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-black text-rose-600">{t("critBelowMin")}</p>
                <ProductList items={data.critical.belowMinimum} empty={t("empty")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black text-amber-600">{t("critEndsWeek")}</p>
                <ProductList items={data.critical.endsThisWeek} empty={t("empty")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black text-slate-600">{t("critNever")}</p>
                <ProductList items={data.critical.neverCounted} empty={t("empty")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black text-slate-600">{t("critNoMove")}</p>
                <ProductList items={data.critical.noMovement} empty={t("empty")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black text-[#6c4cff]">{t("critAnomaly")}</p>
                <ProductList items={data.critical.anomalous} empty={t("empty")} />
              </div>
            </div>
          </Section>

          <Section title={t("heatmapTitle")}>
            <Heatmap cells={data.heatmap} t={t} />
          </Section>
        </>
      ) : null}

      {drill ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div
            className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
            dir={dir}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-black text-slate-900">{drill.title}</h3>
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                {t("close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {drillLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
                </div>
              ) : drillRows.length === 0 ? (
                <p className="py-8 text-center text-sm font-semibold text-slate-400">{t("empty")}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {drillRows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{row.title}</p>
                        {row.subtitle || row.meta ? (
                          <p className="truncate text-xs font-semibold text-slate-400">
                            {row.subtitle ?? row.meta}
                          </p>
                        ) : null}
                      </div>
                      {row.value != null ? (
                        <span className="shrink-0 font-black tabular-nums text-slate-800">
                          {row.value}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
