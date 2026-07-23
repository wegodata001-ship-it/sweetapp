"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
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
  AnalyticsDrillTable,
  AnalyticsDrillType,
  AnalyticsRange,
  ProductSearchHit,
} from "@/lib/inventory/analytics-types";

const PIE_COLORS = ["#6c4cff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

type DrillState = { type: AnalyticsDrillType; title: string; day?: string } | null;

function KpiCard({
  label,
  value,
  onClick,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
  tone?: "default" | "danger" | "ok" | "warn";
  hint?: string;
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
        onClick ? "cursor-pointer transition hover:brightness-95 active:scale-[0.99]" : ""
      }`}
    >
      <p className="text-[11px] font-bold opacity-70">{label}</p>
      <p className="mt-1 truncate text-xl font-black tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] font-semibold opacity-60">{hint}</p> : null}
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

function DrillSheet({
  open,
  title,
  loading,
  table,
  onClose,
  t,
  dir,
}: {
  open: boolean;
  title: string;
  loading: boolean;
  table: AnalyticsDrillTable | null;
  onClose: () => void;
  t: (k: string) => string;
  dir: string;
}) {
  if (!open) return null;
  const colLabel = (key: string) => t(`col_${key}`);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        dir={dir}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
            </div>
          ) : !table || table.rows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    {table.columns.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-bold">
                        {colLabel(c.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, idx) => (
                    <tr key={String(row.id ?? idx)} className="border-b border-slate-50">
                      {table.columns.map((c) => (
                        <td key={c.key} className="px-2 py-2 font-semibold tabular-nums text-slate-800">
                          {row[c.key] == null || row[c.key] === "" ? "—" : String(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
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
  const [productId, setProductId] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [productQ, setProductQ] = useState("");
  const [productHits, setProductHits] = useState<ProductSearchHit[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [data, setData] = useState<AnalyticsDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [drill, setDrill] = useState<DrillState>(null);
  const [drillTable, setDrillTable] = useState<AnalyticsDrillTable | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [trendTab, setTrendTab] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (locationId) p.set("locationId", locationId);
    if (workerId) p.set("workerId", workerId);
    if (category) p.set("category", category);
    if (productId) p.set("productId", productId);
    return p.toString();
  }, [range, locationId, workerId, category, productId]);

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

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = productQ.trim();
    if (q.length < 1) {
      setProductHits([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void (async () => {
        setProductSearching(true);
        try {
          const res = await fetch(
            `/api/inventory/analytics/products?q=${encodeURIComponent(q)}`,
            { credentials: "same-origin" },
          );
          const j = (await res.json()) as { data?: ProductSearchHit[] };
          setProductHits(j.data ?? []);
        } catch {
          setProductHits([]);
        } finally {
          setProductSearching(false);
        }
      })();
    }, 280);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [productQ]);

  const openDrill = async (type: AnalyticsDrillType, title: string, day?: string) => {
    setDrill({ type, title, day });
    setDrillLoading(true);
    setDrillTable(null);
    try {
      const params = new URLSearchParams(query);
      params.set("type", type);
      if (day) params.set("day", day);
      const res = await fetch(`/api/inventory/analytics/drill?${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: AnalyticsDrillTable };
      setDrillTable(j.data ?? null);
    } finally {
      setDrillLoading(false);
    }
  };

  const exportFile = (format: "xlsx" | "csv") => {
    window.open(`/api/inventory/analytics/export?format=${format}&${query}`, "_blank");
  };

  const clearProduct = () => {
    setProductId("");
    setProductLabel("");
    setProductQ("");
    setProductHits([]);
  };

  const trendData = data?.usage[trendTab] ?? [];
  const pieAccuracy = data
    ? [
        { name: t("match"), value: Math.max(0, data.kpis.avgAccuracyPct) },
        { name: t("gap"), value: Math.max(0, 100 - data.kpis.avgAccuracyPct) },
      ]
    : [];
  const focus = data?.productFocus ?? null;

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

        <div className="relative w-full min-w-[14rem] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3" />
          <input
            value={productId ? productLabel : productQ}
            onChange={(e) => {
              if (productId) clearProduct();
              setProductQ(e.target.value);
            }}
            placeholder={t("filterProduct")}
            className={`${selectCls} w-full ltr:pl-9 rtl:pr-9`}
          />
          {productId ? (
            <button
              type="button"
              onClick={clearProduct}
              className="absolute top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 ltr:right-2 rtl:left-2"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          {!productId && (productSearching || productHits.length > 0) ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-[#e7ecf5] bg-white py-1 shadow-lg">
              {productSearching ? (
                <li className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-[#6c4cff]" />
                </li>
              ) : (
                productHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-3 py-2 text-start hover:bg-[#f6f8fc]"
                      onClick={() => {
                        setProductId(hit.id);
                        setProductLabel(hit.name);
                        setProductQ("");
                        setProductHits([]);
                      }}
                    >
                      <span className="text-sm font-black text-slate-900">{hit.name}</span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {[hit.barcode, hit.sku, hit.nameAr, hit.nameEn].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
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
          {focus ? (
            <Section title={t("productFocusTitle", { name: focus.name })}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <KpiCard label={t("avgDaily")} value={focus.avgDaily} tone="ok" />
                <KpiCard label={t("avgWeekly")} value={focus.avgWeekly} />
                <KpiCard label={t("avgMonthly")} value={focus.avgMonthly} />
                <KpiCard label={t("avgYearly")} value={focus.avgYearly} />
                <KpiCard
                  label={t("daysLeft")}
                  value={focus.daysLeft != null ? focus.daysLeft : "—"}
                  tone={focus.daysLeft != null && focus.daysLeft < 7 ? "danger" : "warn"}
                  hint={focus.daysLeft != null ? t("daysLeftHint", { d: focus.daysLeft }) : undefined}
                />
                <KpiCard
                  label={t("lastUsage")}
                  value={
                    focus.lastUsageAt
                      ? new Date(focus.lastUsageAt).toLocaleDateString()
                      : "—"
                  }
                />
                <KpiCard label={t("countsPerformed")} value={focus.countsPerformed} />
                <KpiCard label={t("currentStock")} value={focus.currentQty} />
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-black text-slate-600">{t("productLocations")}</p>
                <ul className="space-y-1">
                  {focus.locations.map((loc, i) => (
                    <li
                      key={`${loc.id ?? "x"}-${i}`}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100"
                    >
                      <span className="font-bold text-slate-800">{loc.name}</span>
                      <span className="font-black tabular-nums">{loc.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label={t("kpiProducts")}
              value={data.kpis.totalProducts}
              onClick={() => void openDrill("highUsage", t("kpiProducts"))}
            />
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
              hint={t("tapForTable")}
            />
            <KpiCard
              label={t("kpiSurplus")}
              value={data.kpis.surplusProducts}
              onClick={() => void openDrill("surpluses", t("kpiSurplus"))}
              hint={t("tapForTable")}
            />
            <KpiCard label={t("kpiUnits")} value={data.kpis.totalUnits} />
            <KpiCard
              label={t("kpiUncounted30")}
              value={data.kpis.uncountedOver30Days}
              tone="warn"
              onClick={() => void openDrill("uncounted", t("kpiUncounted30"))}
              hint={t("tapForTable")}
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
                <AreaChart
                  data={trendData}
                  onClick={(state) => {
                    const period = (state as { activeLabel?: string } | undefined)?.activeLabel;
                    if (period && trendTab === "daily") {
                      void openDrill("dayUsage", t("dayDrillTitle", { day: period }), period);
                    }
                  }}
                >
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
                    style={{ cursor: "pointer" }}
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
            <p className="mt-1 text-center text-[10px] font-bold text-slate-400">
              {t("chartClickHint")}
            </p>
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
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="quantity" name={t("usage")} fill="#6c4cff" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <button
                type="button"
                onClick={() => void openDrill("highUsage", t("topMostUsed"))}
                className="mt-2 w-full rounded-xl bg-[#6c4cff]/10 py-2 text-xs font-black text-[#6c4cff]"
              >
                {t("tapForTable")}
              </button>
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
              <button
                type="button"
                onClick={() => void openDrill("noMovement", t("topNoMovement"))}
                className="mt-2 w-full rounded-xl bg-slate-100 py-2 text-xs font-black text-slate-700"
              >
                {t("tapForTable")}
              </button>
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
            <button
              type="button"
              onClick={() => void openDrill("workers", t("workersTitle"))}
              className="w-full rounded-xl bg-slate-100 py-2 text-xs font-black text-slate-700"
            >
              {t("tapForTable")}
            </button>
          </Section>

          <Section title={t("locationsTitle")}>
            <div className="space-y-2">
              {data.locations.slice(0, 12).map((loc) => (
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
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4">
                    <span>
                      {t("colProducts")}: {loc.productCount}
                    </span>
                    <span className="text-rose-600">
                      {t("kpiShortage")}: {loc.shortageCount}
                    </span>
                    <span className="text-emerald-700">
                      {t("kpiSurplus")}: {loc.surplusCount}
                    </span>
                    <span>
                      {t("kpiAccuracy")}: {loc.accuracyPct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("forecastTitle")}>
            <div className="space-y-2">
              {data.forecast.slice(0, 12).map((f) => (
                <div key={f.id} className="rounded-2xl border border-[#e7ecf5] px-3 py-3">
                  <p className="font-black text-slate-900">{f.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {f.daysLeft != null
                      ? t("coversDays", { d: f.daysLeft })
                      : t("noUsageSignal")}
                  </p>
                  {f.orderInDays != null && f.daysLeft != null && f.daysLeft < 14 ? (
                    <p className="mt-1 text-xs font-black text-amber-700">
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
        </>
      ) : null}

      <DrillSheet
        open={!!drill}
        title={drill?.title ?? ""}
        loading={drillLoading}
        table={drillTable}
        onClose={() => setDrill(null)}
        t={t}
        dir={dir}
      />
    </div>
  );
}
