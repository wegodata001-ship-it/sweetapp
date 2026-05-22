"use client";

import { AlertTriangle, CheckCircle2, Clock, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { InventoryCountWorkspace } from "./inventory-count-workspace";
import { InventoryFilters } from "./inventory-filters";
import { InventoryStatsCards } from "./inventory-stats-cards";
import { ShelfHistoryDrawer, ShelfStatsDrawer } from "./shelf-history-drawer";
import type {
  InventoryLocationPick,
  ListMeta,
  MonthlyCountRow,
  ShelfSummary,
} from "./types";
import { WarehouseAreaCard } from "./warehouse-area-card";
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
  onShelfActivity?: () => void;
};

export function InventoryCountDashboard({
  shelfSummaries,
  shortageCount,
  inventoryLocations,
  countLocationName,
  setCountLocationName,
  countDate,
  onAddProduct,
  hasLocations,
  refreshKey = 0,
  onShelfActivity,
}: InventoryCountDashboardProps) {
  const { t, bcp47, dir } = useI18n();
  const tD = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.countDashboard.${key}`, vars);

  const [workspaceShelf, setWorkspaceShelf] = useState<string | null>(null);
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
  const [shelfProgressMap, setShelfProgressMap] = useState<Record<string, number>>({});

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
          data?: {
            product: { location: string; id: string };
            difference: number;
            createdAt: string;
          }[];
        };
        if (cancelled) return;
        const rows = j.data ?? [];
        const countedToday = new Set<string>();
        const recent = new Set<string>();
        const lastMap: Record<string, string> = {};
        const progressByLoc: Record<string, Set<string>> = {};
        let surplus = 0;
        const todayStart = `${today}T00:00:00`;
        for (const r of rows) {
          const loc = (r.product?.location ?? "").trim();
          if (!loc) continue;
          if (r.createdAt >= todayStart) {
            countedToday.add(loc);
            if (r.difference > 0) surplus += 1;
            if (!progressByLoc[loc]) progressByLoc[loc] = new Set();
            progressByLoc[loc].add(r.product.id);
          } else {
            recent.add(loc);
          }
          if (!lastMap[loc] || r.createdAt > lastMap[loc]) lastMap[loc] = r.createdAt;
        }
        const progressPct: Record<string, number> = {};
        for (const s of shelfSummaries) {
          const name = s.name.trim();
          const counted = progressByLoc[name]?.size ?? 0;
          progressPct[name] =
            s.productCount > 0 ? Math.round((counted / s.productCount) * 100) : 0;
        }
        setShelvesCountedToday(countedToday);
        setShelvesRecentActivity(recent);
        setTodaySurplusCount(surplus);
        setShelfLastUpdateMap(lastMap);
        setShelfProgressMap(progressPct);
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
  }, [refreshKey, shelfSummaries]);

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

  const openWorkspace = (name: string) => {
    const trimmed = name.trim();
    setCountLocationName(trimmed);
    setWorkspaceShelf(trimmed);
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
      <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="order-2 min-w-0 flex-1 text-end md:order-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/90">
              {t("ops.inventory.workspace.kicker")}
            </p>
            <h2 className="mt-2 text-2xl font-black md:text-3xl">{t("ops.inventory.workspace.heroTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm font-medium text-slate-300 md:text-base">
              {t("ops.inventory.workspace.heroSubtitle")}
            </p>
          </div>
          <div className="order-1 flex shrink-0 justify-center md:order-2">
            <div className="grid h-24 w-24 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/20 md:h-28 md:w-28">
              <Warehouse className="h-12 w-12 text-sky-200 md:h-14 md:w-14" strokeWidth={1.5} aria-hidden />
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
        <h3 className="text-base font-black text-slate-900">{t("ops.inventory.workspace.areasTitle")}</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">{t("ops.inventory.workspace.areasHint")}</p>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredShelves.map((shelf) => {
              const trimmed = shelf.name.trim();
              const counted = shelvesCountedToday.has(trimmed);
              const status = resolveShelfStatus(
                shelf,
                counted,
                shelvesRecentActivity.has(trimmed),
              );
              const lastIso = shelfLastUpdateMap[trimmed] ?? null;
              const progressPct = shelfProgressMap[trimmed] ?? (counted ? 100 : 0);
              return (
                <WarehouseAreaCard
                  key={shelf.name}
                  shelf={shelf}
                  status={status}
                  progressPct={progressPct}
                  lastUpdateIso={lastIso}
                  bcp47={bcp47}
                  tD={tD}
                  onOpenWorkspace={() => openWorkspace(shelf.name)}
                  onHistory={() => setHistoryShelf(trimmed)}
                  onStats={() => setStatsShelf(shelf)}
                  onAddProduct={() => onAddProduct(trimmed)}
                />
              );
            })}
          </div>
        )}
      </div>

      {workspaceShelf ? (
        <InventoryCountWorkspace
          shelfName={workspaceShelf}
          countDate={countDate}
          refreshKey={refreshKey}
          onClose={() => {
            setWorkspaceShelf(null);
            setCountLocationName("");
            onShelfActivity?.();
          }}
          onProductCounted={() => onShelfActivity?.()}
          onAddProduct={() => onAddProduct(workspaceShelf)}
        />
      ) : null}

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
