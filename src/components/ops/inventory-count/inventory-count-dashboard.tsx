"use client";

import { AlertTriangle, CheckCircle2, Clock, Package, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { InventoryFilters } from "./inventory-filters";
import { InventoryStatsCards } from "./inventory-stats-cards";
import { ShelfCard } from "./shelf-card";
import { ShelfExpandedPanel } from "./shelf-expanded-panel";
import { ShelfHistoryDrawer, ShelfStatsDrawer } from "./shelf-history-drawer";
import type {
  InventoryLocationPick,
  ListMeta,
  MonthlyCountRow,
  ShelfSummary,
} from "./types";
import { formatRelativeTime, localYmd, resolveShelfStatus } from "./utils";

export type { InventoryCountProductRow, MonthlyCountRow, ShelfSummary } from "./types";

export type InventoryCountDashboardProps = {
  shelfSummaries: ShelfSummary[];
  shortageCount: number;
  inventoryLocations: InventoryLocationPick[];
  countLocationName: string;
  setCountLocationName: (name: string) => void;
  monthlyRows: MonthlyCountRow[];
  actualById: Record<string, string>;
  setActualById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  countDate: string;
  setCountDate: (v: string) => void;
  countQ: string;
  setCountQ: (v: string) => void;
  saveMonthly: () => void | Promise<void>;
  busy: boolean;
  countMeta: ListMeta | null;
  countPage: number;
  setCountPage: React.Dispatch<React.SetStateAction<number>>;
  onAddProduct: (shelfName: string) => void;
  hasLocations: boolean;
  refreshKey?: number;
};

export function InventoryCountDashboard({
  shelfSummaries,
  shortageCount,
  inventoryLocations,
  countLocationName,
  setCountLocationName,
  monthlyRows,
  actualById,
  setActualById,
  countDate,
  setCountDate,
  countQ,
  setCountQ,
  saveMonthly,
  busy,
  countMeta,
  countPage,
  setCountPage,
  onAddProduct,
  hasLocations,
  refreshKey = 0,
}: InventoryCountDashboardProps) {
  const { t, bcp47, dir } = useI18n();
  const tD = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.countDashboard.${key}`, vars);

  const [expandedShelf, setExpandedShelf] = useState("");
  const [countingMode, setCountingMode] = useState(false);
  const [shelfSearch, setShelfSearch] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterShortageOnly, setFilterShortageOnly] = useState(false);
  const [filterOkOnly, setFilterOkOnly] = useState(false);
  const [historyShelf, setHistoryShelf] = useState<string | null>(null);
  const [statsShelf, setStatsShelf] = useState<ShelfSummary | null>(null);
  const [shelvesCountedToday, setShelvesCountedToday] = useState<Set<string>>(new Set());
  const [shelvesRecentActivity, setShelvesRecentActivity] = useState<Set<string>>(new Set());
  const [todaySurplusCount, setTodaySurplusCount] = useState(0);
  const [shelfLastUpdateMap, setShelfLastUpdateMap] = useState<Record<string, string>>({});

  const activeShelf = countLocationName.trim();
  const isExpanded = Boolean(activeShelf && expandedShelf === activeShelf);

  useEffect(() => {
    const today = localYmd(new Date());
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/count-history?dateFrom=${encodeURIComponent(localYmd(weekAgo))}&dateTo=${encodeURIComponent(today)}`,
          { credentials: "same-origin" },
        );
        const j = (await res.json()) as {
          data?: { product: { location: string }; difference: number; createdAt: string }[];
        };
        if (cancelled) return;
        const rows = j.data ?? [];
        const countedToday = new Set<string>();
        const recent = new Set<string>();
        const lastMap: Record<string, string> = {};
        let surplus = 0;
        const todayStart = `${today}T00:00:00`;
        for (const r of rows) {
          const loc = (r.product?.location ?? "").trim();
          if (!loc) continue;
          if (r.createdAt >= todayStart) {
            countedToday.add(loc);
            if (r.difference > 0) surplus += 1;
          } else {
            recent.add(loc);
          }
          if (!lastMap[loc] || r.createdAt > lastMap[loc]) lastMap[loc] = r.createdAt;
        }
        setShelvesCountedToday(countedToday);
        setShelvesRecentActivity(recent);
        setTodaySurplusCount(surplus);
        setShelfLastUpdateMap(lastMap);
      } catch {
        if (!cancelled) {
          setShelvesCountedToday(new Set());
          setShelvesRecentActivity(new Set());
          setTodaySurplusCount(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!activeShelf || !monthlyRows.length) return;
    let max: string | null = null;
    for (const p of monthlyRows) {
      if (p.lastCountedAt && (!max || p.lastCountedAt > max)) max = p.lastCountedAt;
    }
    if (max) {
      setShelfLastUpdateMap((m) => ({ ...m, [activeShelf]: max }));
    }
  }, [activeShelf, monthlyRows]);

  const pendingShelfCount = useMemo(
    () => shelfSummaries.filter((s) => !shelvesCountedToday.has(s.name.trim())).length,
    [shelfSummaries, shelvesCountedToday],
  );

  const filteredShelves = useMemo(() => {
    const q = shelfSearch.trim().toLowerCase();
    return shelfSummaries.filter((s) => {
      const name = s.name.trim();
      if (filterArea && name !== filterArea.trim()) return false;
      if (q && !name.toLowerCase().includes(q)) return false;
      const counted = shelvesCountedToday.has(name);
      if (filterShortageOnly && s.shortageCount <= 0) return false;
      if (filterOkOnly && (!counted || s.shortageCount > 0)) return false;
      return true;
    });
  }, [
    shelfSummaries,
    shelfSearch,
    filterArea,
    filterShortageOnly,
    filterOkOnly,
    shelvesCountedToday,
  ]);

  const sheetStats = useMemo(() => {
    let match = 0;
    let short = 0;
    let surplus = 0;
    let filled = 0;
    for (const r of monthlyRows) {
      if (r.actual === null || Number.isNaN(r.actual)) continue;
      filled += 1;
      const d = r.actual - r.previousQuantity;
      if (d === 0) match += 1;
      else if (d < 0) short += 1;
      else surplus += 1;
    }
    return { total: monthlyRows.length, match, short, surplus, filled };
  }, [monthlyRows]);

  const startCount = (name: string) => {
    const trimmed = name.trim();
    if (expandedShelf === trimmed && activeShelf === trimmed) {
      setCountingMode((c) => !c);
      return;
    }
    setCountLocationName(trimmed);
    setExpandedShelf(trimmed);
    setCountingMode(true);
  };

  const collapseShelf = () => {
    setExpandedShelf("");
    setCountLocationName("");
    setCountingMode(false);
  };

  const bumpQty = (id: string, prev: number, delta: number) => {
    const cur = actualById[id];
    const base = cur === "" || cur === undefined ? prev : Number(cur);
    const next = Math.max(0, (Number.isFinite(base) ? base : prev) + delta);
    setActualById((p) => ({ ...p, [id]: String(next) }));
  };

  const statCards = [
    {
      icon: CheckCircle2,
      tone: "emerald" as const,
      label: tD("kpiCountedToday"),
      value: String(shelvesCountedToday.size),
    },
    {
      icon: AlertTriangle,
      tone: "rose" as const,
      label: tD("kpiShortage"),
      value: String(shortageCount),
    },
    {
      icon: TrendingUp,
      tone: "amber" as const,
      label: tD("kpiSurplus"),
      value: String(todaySurplusCount),
    },
    {
      icon: Clock,
      tone: "sky" as const,
      label: tD("kpiPending"),
      value: String(pendingShelfCount),
    },
  ];

  return (
    <div className="space-y-6" dir={dir}>
      <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-sky-50 to-slate-100/90 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="order-2 min-w-0 flex-1 text-end md:order-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700/80">
              {tD("heroKicker")}
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">{tD("heroTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm font-medium text-slate-600 md:text-base">
              {tD("heroSubtitle")}
            </p>
          </div>
          <div className="order-1 flex shrink-0 justify-center md:order-2 md:justify-start">
            <div className="grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-sky-100 to-indigo-200/70 shadow-inner ring-1 ring-white/90 md:h-28 md:w-28">
              <Package className="h-12 w-12 text-sky-700/90 md:h-14 md:w-14" strokeWidth={1.5} aria-hidden />
            </div>
          </div>
        </div>
      </section>

      <InventoryStatsCards stats={statCards} />

      <InventoryFilters
        shelfSearch={shelfSearch}
        onShelfSearch={setShelfSearch}
        filterArea={filterArea}
        onFilterArea={setFilterArea}
        areas={inventoryLocations}
        filterShortageOnly={filterShortageOnly}
        onFilterShortageOnly={setFilterShortageOnly}
        filterOkOnly={filterOkOnly}
        onFilterOkOnly={setFilterOkOnly}
        searchPlaceholder={tD("filterSearchShelf")}
        areaLabel={tD("filterArea")}
        areaAll={tD("filterAreaAll")}
        shortageLabel={tD("filterShortageOnly")}
        okLabel={tD("filterOkOnly")}
      />

      <div>
        <h3 className="text-sm font-black text-slate-800">{tD("shelvesTitle")}</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">{tD("shelvesHint")}</p>
        {!hasLocations ? (
          <p className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-4 text-sm font-semibold text-amber-900">
            {tD("noLocations")}{" "}
            <Link href="/ops/inventory/locations" className="font-black underline">
              {t("ops.inventory.manageAreasLink")}
            </Link>
          </p>
        ) : filteredShelves.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-600">
            {tD("noShelvesMatch")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredShelves.map((shelf) => {
              const trimmed = shelf.name.trim();
              const isActive = activeShelf === trimmed;
              const counted = shelvesCountedToday.has(trimmed);
              const status = resolveShelfStatus(
                shelf,
                counted,
                shelvesRecentActivity.has(trimmed),
              );
              const lastIso = shelfLastUpdateMap[trimmed] ?? null;
              return (
                <Fragment key={shelf.name}>
                  <ShelfCard
                    shelf={shelf}
                    status={status}
                    isActive={isActive}
                    lastUpdateIso={lastIso}
                    bcp47={bcp47}
                    tD={tD}
                    onStartCount={() => startCount(shelf.name)}
                    onHistory={() => setHistoryShelf(trimmed)}
                    onStats={() => setStatsShelf(shelf)}
                    onAddProduct={() => onAddProduct(trimmed)}
                  />
                  {isExpanded && isActive ? (
                    <div className="col-span-full">
                      <ShelfExpandedPanel
                        shelfName={trimmed}
                        countingMode={countingMode}
                        monthlyRows={monthlyRows}
                        countDate={countDate}
                        onCountDate={setCountDate}
                        countQ={countQ}
                        onCountQ={setCountQ}
                        onAddProduct={() => onAddProduct(trimmed)}
                        onCollapse={collapseShelf}
                        actualById={actualById}
                        setActualById={setActualById}
                        bumpQty={bumpQty}
                        countMeta={countMeta}
                        countPage={countPage}
                        setCountPage={setCountPage}
                        sheetStats={sheetStats}
                        saveMonthly={saveMonthly}
                        busy={busy}
                        tD={tD}
                        dateLabel={t("ops.inventory.count.date")}
                        addProductLabel={t("ops.inventory.count.addInventoryItem")}
                        prevLabel={t("ops.inventory.pagination.previous")}
                        nextLabel={t("ops.inventory.pagination.next")}
                      />
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <ShelfHistoryDrawer
        open={historyShelf !== null}
        shelfName={historyShelf ?? ""}
        onClose={() => setHistoryShelf(null)}
      />
      <ShelfStatsDrawer
        open={statsShelf !== null}
        shelfName={statsShelf?.name ?? ""}
        productCount={statsShelf?.productCount ?? 0}
        shortageCount={statsShelf?.shortageCount ?? 0}
        countedToday={statsShelf ? shelvesCountedToday.has(statsShelf.name.trim()) : false}
        onClose={() => setStatsShelf(null)}
      />
    </div>
  );
}
