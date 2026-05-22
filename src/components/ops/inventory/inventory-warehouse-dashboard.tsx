"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers, Plus, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import type { ShelfSummary } from "@/components/ops/inventory-count/types";
import { localYmd, resolveShelfStatus } from "@/components/ops/inventory-count/utils";
import { AddShelfModal } from "./add-shelf-modal";
import { ShelfCountModal } from "./shelf-count-modal";
import { ShelfGridCard, type ShelfGridModel } from "./shelf-grid-card";
import { WarehouseKpiCards } from "./warehouse-kpi-cards";

type LocationRow = { id: string; name: string; description: string | null };
type StatsDto = {
  shortageCount: number;
  lowStockCount: number;
  todayMovements: number;
};

export function InventoryWarehouseDashboard() {
  const { t, bcp47, dir } = useI18n();
  const tW = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.${key}`, vars);
  const tCard = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.card.${key}`, vars);

  const [shelfSummaries, setShelfSummaries] = useState<ShelfSummary[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [shelfMeta, setShelfMeta] = useState<
    Record<string, { countedToday: number; lastIso: string | null }>
  >({});
  const [modalShelf, setModalShelf] = useState<string | null>(null);
  const [addShelfOpen, setAddShelfOpen] = useState(false);
  const [search, setSearch] = useState("");
  const countDate = localYmd(new Date());

  const loadShelves = useCallback(async () => {
    const res = await fetch("/api/inventory/shelf-summaries", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ShelfSummary[] };
    setShelfSummaries(j.data ?? []);
  }, []);

  const loadLocations = useCallback(async () => {
    const res = await fetch("/api/inventory/locations", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: LocationRow[] };
    setLocations(j.data ?? []);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/inventory/stats", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: StatsDto };
    if (j.data) setStats(j.data);
  }, []);

  const loadShelfMeta = useCallback(async () => {
    const today = localYmd(new Date());
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    try {
      const res = await fetch(
        `/api/inventory/count-history?dateFrom=${encodeURIComponent(localYmd(weekAgo))}&dateTo=${encodeURIComponent(today)}`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as {
        data?: { product: { id: string; location: string }; createdAt: string }[];
      };
      const byLoc = new Map<string, Set<string>>();
      const lastMap: Record<string, string> = {};
      const todayStart = `${today}T00:00:00`;
      for (const r of j.data ?? []) {
        const loc = (r.product?.location ?? "").trim();
        if (!loc) continue;
        if (r.createdAt >= todayStart) {
          if (!byLoc.has(loc)) byLoc.set(loc, new Set());
          byLoc.get(loc)!.add(r.product.id);
        }
        if (!lastMap[loc] || r.createdAt > lastMap[loc]) lastMap[loc] = r.createdAt;
      }
      const meta: Record<string, { countedToday: number; lastIso: string | null }> = {};
      for (const [loc, set] of byLoc) {
        meta[loc] = { countedToday: set.size, lastIso: lastMap[loc] ?? null };
      }
      for (const loc of Object.keys(lastMap)) {
        if (!meta[loc]) meta[loc] = { countedToday: 0, lastIso: lastMap[loc] };
      }
      setShelfMeta(meta);
    } catch {
      setShelfMeta({});
    }
  }, []);

  const refresh = useCallback(() => {
    void Promise.all([loadShelves(), loadLocations(), loadStats(), loadShelfMeta()]);
  }, [loadShelves, loadLocations, loadStats, loadShelfMeta]);

  useEffect(() => {
    queueMicrotask(() => refresh());
  }, [refresh]);

  const locationByName = useMemo(() => {
    const m = new Map<string, LocationRow>();
    for (const l of locations) m.set(l.name.trim(), l);
    return m;
  }, [locations]);

  const shelves: ShelfGridModel[] = useMemo(() => {
    const map = new Map<string, ShelfGridModel>();
    for (const loc of locations) {
      const name = loc.name.trim();
      map.set(name, {
        name,
        productCount: 0,
        shortageCount: 0,
        countedToday: 0,
        progressPct: 0,
        lastUpdateIso: null,
        status: "pending",
        locationId: loc.id,
      });
    }
    for (const s of shelfSummaries) {
      const name = s.name.trim();
      const meta = shelfMeta[name];
      const countedToday = meta?.countedToday ?? 0;
      const progressPct =
        s.productCount > 0 ? Math.min(100, Math.round((countedToday / s.productCount) * 100)) : 0;
      const counted = countedToday >= s.productCount && s.productCount > 0;
      const existing = map.get(name);
      map.set(name, {
        name,
        productCount: s.productCount,
        shortageCount: s.shortageCount,
        countedToday,
        progressPct,
        lastUpdateIso: meta?.lastIso ?? null,
        status: resolveShelfStatus(s, counted, false),
        locationId: existing?.locationId ?? locationByName.get(name)?.id ?? null,
      });
    }
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [locations, shelfSummaries, shelfMeta, search, locationByName]);

  const kpis = useMemo(
    () => [
      {
        key: "shelves",
        label: tW("kpiShelves"),
        value: shelves.length,
        icon: Warehouse,
        accent: "#6c4cff",
        iconBg: "rgba(108, 76, 255, 0.12)",
      },
      {
        key: "short",
        label: tW("kpiShortage"),
        value: stats?.shortageCount ?? 0,
        icon: AlertTriangle,
        accent: "#ff5b6e",
        iconBg: "rgba(255, 91, 110, 0.12)",
      },
      {
        key: "over",
        label: tW("kpiOver"),
        value: stats?.lowStockCount ?? 0,
        icon: TrendingUp,
        accent: "#ffb020",
        iconBg: "rgba(255, 176, 32, 0.15)",
      },
      {
        key: "mov",
        label: tW("kpiMovements"),
        value: stats?.todayMovements ?? 0,
        icon: Layers,
        accent: "#16c784",
        iconBg: "rgba(22, 199, 132, 0.12)",
      },
    ],
    [shelves.length, stats, tW],
  );

  const openShelf = modalShelf ? locationByName.get(modalShelf.trim()) : null;

  return (
    <div className="space-y-5" dir={dir} style={{ background: "#f6f8fc" }}>
      <WarehouseKpiCards items={kpis} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{tW("gridTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tW("searchShelf")}
            className="h-10 min-w-[12rem] rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/15"
          />
          <button
            type="button"
            onClick={() => setAddShelfOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-black text-white shadow-md transition hover:brightness-110"
            style={{ background: "#6c4cff" }}
          >
            <Plus className="h-4 w-4" />
            {tW("addShelf")}
          </button>
        </div>
      </div>

      {shelves.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#e7ecf5] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">{tW("noShelves")}</p>
          <Link
            href="/ops/inventory/locations"
            className="mt-2 inline-block text-sm font-black text-[#6c4cff] underline"
          >
            {t("ops.inventory.manageAreasLink")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shelves.map((shelf) => (
            <ShelfGridCard
              key={shelf.name}
              shelf={shelf}
              bcp47={bcp47}
              t={tCard}
              onStartCount={() => setModalShelf(shelf.name)}
              onViewProducts={() => setModalShelf(shelf.name)}
            />
          ))}
        </div>
      )}

      <ShelfCountModal
        open={modalShelf !== null}
        shelfName={modalShelf ?? ""}
        locationId={openShelf?.id ?? locationByName.get(modalShelf?.trim() ?? "")?.id ?? null}
        countDate={countDate}
        onClose={() => setModalShelf(null)}
        onSaved={refresh}
        t={(k, v) => t(`ops.inventory.warehouse.modal.${k}`, v)}
      />

      <AddShelfModal
        open={addShelfOpen}
        onClose={() => setAddShelfOpen(false)}
        onCreated={(loc) => {
          setLocations((prev) =>
            [...prev, { id: loc.id, name: loc.name, description: loc.description }].sort((a, b) =>
              a.name.localeCompare(b.name, "he"),
            ),
          );
          setShelfSummaries((prev) => {
            if (prev.some((s) => s.name.trim() === loc.name.trim())) return prev;
            return [
              ...prev,
              { name: loc.name, productCount: 0, shortageCount: 0 },
            ].sort((a, b) => a.name.localeCompare(b.name, "he"));
          });
        }}
        t={(k) => t(`ops.inventory.warehouse.addShelf.${k}`)}
      />
    </div>
  );
}
