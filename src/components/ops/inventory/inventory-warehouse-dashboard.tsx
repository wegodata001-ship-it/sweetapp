"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Layers,
  PackageCheck,
  Plus,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import type { ShelfSummary } from "@/components/ops/inventory-count/types";
import { localYmd } from "@/components/ops/inventory-count/utils";
import { LocationFormModal, type LocationFormValues } from "./location-form-modal";
import { ShelfAddProductsModal } from "./shelf-add-products-modal";
import { ShelfCountModal } from "./shelf-count-modal";
import { ShelfDeleteConfirmModal } from "./shelf-delete-confirm-modal";
import { ShelfHistoryModal } from "./shelf-history-modal";
import { ShelfTransferModal } from "./shelf-transfer-modal";
import type { ShelfCardMenuAction } from "./shelf-card-actions-menu";
import { WarehouseKpiCards, type WarehouseKpi } from "./warehouse-kpi-cards";
import {
  formatCountElapsed,
  shelfCountTargetMinutes,
  type ShelfCountSession,
} from "@/lib/inventory/shelf-count-session";
import {
  COUNT_STATUS_I18N,
  LOCATION_TYPE_I18N,
  LOCATION_TYPES,
  type CountLifecycleStatus,
  type LocationType,
} from "@/lib/inventory/location-types";
import {
  resolveShelfVisualStatus,
  ShelfGridCard,
  type ShelfGridModel,
} from "./shelf-grid-card";

type SortKey = "name" | "createdAt" | "productCount" | "matchPct" | "lastCountAt";
type CountFilter = "" | CountLifecycleStatus;

function canManageInventory(user: { role: string; permissions: string[] } | null) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
  return user.permissions.includes("inventory");
}

function summaryToGrid(s: ShelfSummary): ShelfGridModel {
  const base = {
    name: s.name,
    productCount: s.productCount,
    shortageCount: s.shortageCount,
    surplusCount: s.surplusCount ?? 0,
    matchPct: s.matchPct ?? 0,
  };
  return {
    ...base,
    visualStatus: resolveShelfVisualStatus(base),
    locationId: s.locationId ?? null,
    code: s.code ?? null,
    description: s.description ?? null,
    locationType: s.locationType ?? "WAREHOUSE",
    targetProductCount: s.targetProductCount ?? null,
    color: s.color ?? null,
    isActive: s.isActive ?? true,
    createdAt: s.createdAt ?? null,
    lastCountAt: s.lastCountAt ?? null,
    lastCountedByName: s.lastCountedByName ?? null,
    countStatus: s.countStatus ?? "NOT_STARTED",
    countedProductCount: s.countedProductCount ?? 0,
  };
}

export function InventoryWarehouseDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, dir, bcp47 } = useI18n();
  const tW = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.${key}`, vars);
  const tCard = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.card.${key}`, vars);
  const locale = bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL";

  const canManage = canManageInventory(user);

  const [shelfSummaries, setShelfSummaries] = useState<ShelfSummary[]>([]);
  const [modalShelf, setModalShelf] = useState<string | null>(null);
  const [modalShelfId, setModalShelfId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<Partial<LocationFormValues> | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | LocationType>("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("active");
  const [filterCount, setFilterCount] = useState<CountFilter>("");
  const [filterMinProducts, setFilterMinProducts] = useState("");
  const [filterLastCountFrom, setFilterLastCountFrom] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const countDate = localYmd(new Date());

  const [actionShelf, setActionShelf] = useState<ShelfGridModel | null>(null);
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailShelf, setDetailShelf] = useState<ShelfGridModel | null>(null);
  const [busyShelfName, setBusyShelfName] = useState<string | null>(null);
  const [exitingNames, setExitingNames] = useState<Set<string>>(new Set());
  const [enteringNames, setEnteringNames] = useState<Set<string>>(new Set());
  const [countSessions, setCountSessions] = useState<Record<string, ShelfCountSession>>({});
  const [, setTick] = useState(0);

  const loadShelves = useCallback(async () => {
    const res = await fetch("/api/inventory/shelf-summaries", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ShelfSummary[] };
    setShelfSummaries(j.data ?? []);
  }, []);

  useEffect(() => {
    void loadShelves();
  }, [loadShelves]);

  useEffect(() => {
    if (!modalShelf) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [modalShelf]);

  const openShelfCount = useCallback((shelf: ShelfGridModel) => {
    setCountSessions((prev) => ({
      ...prev,
      [shelf.name]: {
        startedAt: prev[shelf.name]?.startedAt ?? new Date().toISOString(),
        targetMinutes: shelfCountTargetMinutes(shelf.productCount),
      },
    }));
    setModalShelf(shelf.name);
    setModalShelfId(shelf.locationId ?? null);
  }, []);

  const closeShelfCount = useCallback(() => {
    setModalShelf((name) => {
      if (name) {
        setCountSessions((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
      return null;
    });
    setModalShelfId(null);
  }, []);

  const shelves: ShelfGridModel[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minP = filterMinProducts.trim() ? Number(filterMinProducts) : null;
    let list = shelfSummaries.map(summaryToGrid).filter((s) => !exitingNames.has(s.name));

    list = list.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.code ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filterType && (s.locationType ?? "WAREHOUSE") !== filterType) return false;
      if (filterStatus === "active" && s.isActive === false) return false;
      if (filterStatus === "inactive" && s.isActive !== false) return false;
      const cs: CountLifecycleStatus =
        modalShelf === s.name ? "IN_PROGRESS" : s.countStatus ?? "NOT_STARTED";
      if (filterCount && cs !== filterCount) return false;
      if (minP != null && Number.isFinite(minP) && s.productCount < minP) return false;
      if (filterLastCountFrom && (!s.lastCountAt || s.lastCountAt.slice(0, 10) < filterLastCountFrom)) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sortKey) {
        case "productCount":
          return b.productCount - a.productCount;
        case "matchPct":
          return b.matchPct - a.matchPct;
        case "createdAt":
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
        case "lastCountAt":
          return (b.lastCountAt ?? "").localeCompare(a.lastCountAt ?? "");
        default:
          return a.name.localeCompare(b.name, "he");
      }
    });
    return list;
  }, [
    shelfSummaries,
    search,
    filterType,
    filterStatus,
    filterCount,
    filterMinProducts,
    filterLastCountFrom,
    sortKey,
    exitingNames,
    modalShelf,
  ]);

  const kpis: WarehouseKpi[] = useMemo(() => {
    const all = shelfSummaries.map(summaryToGrid);
    const active = all.filter((s) => s.isActive !== false);
    const counting = all.filter((s) => (s.countStatus ?? "NOT_STARTED") === "IN_PROGRESS").length;
    const completed = all.filter((s) => s.countStatus === "COMPLETED").length;
    const countedProducts = all.reduce((n, s) => n + (s.countedProductCount ?? 0), 0);
    const shortage = all.reduce((n, s) => n + s.shortageCount, 0);
    const surplus = all.reduce((n, s) => n + s.surplusCount, 0);
    return [
      { key: "total", label: tW("kpiTotalLocations"), value: all.length, icon: Warehouse, accent: "#6c4cff", iconBg: "#f3e8ff" },
      { key: "active", label: tW("kpiActiveLocations"), value: active.length, icon: Layers, accent: "#2563eb", iconBg: "#dbeafe" },
      { key: "counting", label: tW("kpiActiveCounts"), value: counting + Object.keys(countSessions).length, icon: ClipboardList, accent: "#0ea5e9", iconBg: "#e0f2fe" },
      { key: "done", label: tW("kpiCompletedCounts"), value: completed, icon: CheckCircle2, accent: "#059669", iconBg: "#d1fae5" },
      { key: "counted", label: tW("kpiCountedProducts"), value: countedProducts, icon: PackageCheck, accent: "#7c3aed", iconBg: "#ede9fe" },
      { key: "short", label: tW("kpiShortage"), value: shortage, icon: AlertTriangle, accent: "#e11d48", iconBg: "#ffe4e6" },
      { key: "over", label: tW("kpiSurplus"), value: surplus, icon: TrendingUp, accent: "#d97706", iconBg: "#fef3c7" },
    ];
  }, [shelfSummaries, countSessions, tW]);

  const upsertSummary = useCallback((summary: ShelfSummary) => {
    setShelfSummaries((prev) => {
      const next = prev.filter((s) => s.name.trim() !== summary.name.trim());
      next.push(summary);
      return next.sort((a, b) => a.name.localeCompare(b.name, "he"));
    });
  }, []);

  const shelfApiPath = (shelf: ShelfGridModel) =>
    shelf.locationId ? shelf.locationId : "by-name";

  const handleMenuAction = (shelf: ShelfGridModel, action: ShelfCardMenuAction) => {
    if (!canManage) return;
    setActionShelf(shelf);
    if (action === "edit") {
      if (!shelf.locationId) {
        // מדף טקסט ישן בלי InventoryLocation — יצירה ואז עריכה
        setFormMode("create");
        setFormInitial({
          name: shelf.name,
          description: shelf.description ?? null,
          locationType: "WAREHOUSE",
          isActive: true,
          workers: [],
        });
        setFormOpen(true);
      } else {
        setFormMode("edit");
        setFormInitial({
          id: shelf.locationId,
          name: shelf.name,
          code: shelf.code ?? null,
          description: shelf.description ?? null,
          locationType: (shelf.locationType as LocationType) || "WAREHOUSE",
          targetProductCount: shelf.targetProductCount ?? null,
          color: shelf.color ?? null,
          isActive: shelf.isActive ?? true,
          workers: [],
        });
        setFormOpen(true);
        void (async () => {
          try {
            const res = await fetch(
              `/api/inventory/locations/${encodeURIComponent(shelf.locationId!)}/workers`,
              { credentials: "same-origin" },
            );
            const j = (await res.json()) as {
              data?: { id: string; name: string; area: string; sortOrder: number }[];
            };
            setFormInitial((prev) =>
              prev ? { ...prev, workers: j.data ?? [] } : prev,
            );
          } catch {
            /* keep empty workers */
          }
        })();
      }
    }
    if (action === "addProducts") setAddProductsOpen(true);
    if (action === "delete") setDeleteOpen(true);
    if (action === "duplicate") void duplicateShelf(shelf);
    if (action === "transfer") setTransferOpen(true);
    if (action === "history") setHistoryOpen(true);
    if (action === "export") void exportShelf(shelf);
  };

  const exportShelf = async (shelf: ShelfGridModel) => {
    try {
      const path = shelfApiPath(shelf);
      const url = `/api/inventory/shelves/${encodeURIComponent(path)}/export?name=${encodeURIComponent(shelf.name)}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        showToast({ tone: "error", title: tW("toast.exportFailed"), durationMs: 3000 });
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `count-${shelf.name}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast({ tone: "success", title: tW("toast.exported"), durationMs: 2000 });
    } catch {
      showToast({ tone: "error", title: tW("toast.exportFailed"), durationMs: 3000 });
    }
  };

  const duplicateShelf = async (shelf: ShelfGridModel) => {
    if (busyShelfName) return;
    setBusyShelfName(shelf.name);
    try {
      const res = await fetch(`/api/inventory/shelves/${shelfApiPath(shelf)}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ shelfName: shelf.name }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { summary: ShelfSummary; sourceSummary?: ShelfSummary };
      };
      if (!res.ok || !j.ok || !j.data?.summary) {
        showToast({ tone: "error", title: j.error ?? tW("toast.duplicateFailed"), durationMs: 3000 });
        return;
      }
      if (j.data.sourceSummary) upsertSummary(j.data.sourceSummary);
      upsertSummary(j.data.summary);
      setEnteringNames((prev) => new Set(prev).add(j.data!.summary.name));
      setTimeout(() => {
        setEnteringNames((prev) => {
          const n = new Set(prev);
          n.delete(j.data!.summary.name);
          return n;
        });
      }, 400);
      showToast({ tone: "success", title: tW("toast.duplicated"), durationMs: 2500 });
      await loadShelves();
    } catch {
      showToast({ tone: "error", title: tW("toast.duplicateFailed"), durationMs: 3000 });
    } finally {
      setBusyShelfName(null);
    }
  };

  const confirmDeleteShelf = async () => {
    if (!actionShelf || busyShelfName) return;
    const name = actionShelf.name;
    setBusyShelfName(name);
    try {
      // מחיקה בטוחה דרך locations API אם יש id; אחרת shelves
      let res: Response;
      if (actionShelf.locationId) {
        res = await fetch(`/api/inventory/locations/${encodeURIComponent(actionShelf.locationId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
      } else {
        res = await fetch(
          `/api/inventory/shelves/${shelfApiPath(actionShelf)}?name=${encodeURIComponent(name)}`,
          { method: "DELETE", credentials: "same-origin" },
        );
      }
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { deactivated?: boolean; deleted?: boolean };
      };
      if (!res.ok || !j.ok) {
        showToast({ tone: "error", title: j.error ?? tW("toast.deleteFailed"), durationMs: 3000 });
        return;
      }

      setDeleteOpen(false);
      if (j.data?.deactivated) {
        showToast({ tone: "success", title: tW("toast.deactivated"), durationMs: 3000 });
        await loadShelves();
      } else {
        setExitingNames((prev) => new Set(prev).add(name));
        setTimeout(() => {
          setShelfSummaries((prev) => prev.filter((s) => s.name.trim() !== name.trim()));
          setExitingNames((prev) => {
            const n = new Set(prev);
            n.delete(name);
            return n;
          });
        }, 320);
        showToast({ tone: "success", title: tW("toast.deleted"), durationMs: 2500 });
      }
    } catch {
      showToast({ tone: "error", title: tW("toast.deleteFailed"), durationMs: 3000 });
    } finally {
      setBusyShelfName(null);
      setActionShelf(null);
    }
  };

  const filterSelectClass =
    "h-10 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold outline-none focus:border-[#6c4cff]";

  return (
    <div className="space-y-5" dir={dir}>
      <style>{`
        @keyframes shelf-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{t("ops.inventory.title")}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{tW("pageHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setFormMode("create");
              setFormInitial(null);
              setFormOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-black text-white shadow-md transition hover:brightness-110"
            style={{ background: "#6c4cff" }}
          >
            <Plus className="h-4 w-4" />
            {t("ops.inventory.addStorageLocation")}
          </button>
        </div>
      </header>

      <WarehouseKpiCards items={kpis} />

      <div className="flex flex-wrap items-end gap-2 rounded-[20px] border border-[#e7ecf5] bg-white/90 p-3 shadow-sm">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tW("searchShelf")}
          className={`${filterSelectClass} min-w-[10rem] flex-1`}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | LocationType)}
          className={filterSelectClass}
        >
          <option value="">{tW("filterTypeAll")}</option>
          {LOCATION_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {t(LOCATION_TYPE_I18N[lt])}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}
          className={filterSelectClass}
        >
          <option value="">{tW("filterStatusAll")}</option>
          <option value="active">{tW("filterStatusActive")}</option>
          <option value="inactive">{tW("filterStatusInactive")}</option>
        </select>
        <select
          value={filterCount}
          onChange={(e) => setFilterCount(e.target.value as CountFilter)}
          className={filterSelectClass}
        >
          <option value="">{tW("filterCountAll")}</option>
          <option value="NOT_STARTED">{t(COUNT_STATUS_I18N.NOT_STARTED)}</option>
          <option value="IN_PROGRESS">{t(COUNT_STATUS_I18N.IN_PROGRESS)}</option>
          <option value="COMPLETED">{t(COUNT_STATUS_I18N.COMPLETED)}</option>
        </select>
        <input
          type="number"
          min={0}
          value={filterMinProducts}
          onChange={(e) => setFilterMinProducts(e.target.value)}
          placeholder={tW("filterMinProducts")}
          className={`${filterSelectClass} w-28`}
        />
        <input
          type="date"
          value={filterLastCountFrom}
          onChange={(e) => setFilterLastCountFrom(e.target.value)}
          className={filterSelectClass}
          title={tW("filterLastCountFrom")}
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className={filterSelectClass}
        >
          <option value="name">{tW("sortName")}</option>
          <option value="createdAt">{tW("sortCreated")}</option>
          <option value="productCount">{tW("sortProducts")}</option>
          <option value="matchPct">{tW("sortProgress")}</option>
          <option value="lastCountAt">{tW("sortLastCount")}</option>
        </select>
      </div>

      {shelves.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#e7ecf5] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">{tW("noShelves")}</p>
          <Link
            href="/ops/inventory/locations"
            className="mt-2 inline-block text-sm font-black text-[#6c4cff] underline"
          >
            {t("ops.inventory.manageAreasLink")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shelves.map((shelf) => {
            const session = countSessions[shelf.name];
            const isCounting = modalShelf === shelf.name;
            const elapsed =
              session && isCounting
                ? formatCountElapsed(Date.now() - new Date(session.startedAt).getTime())
                : "00:00";
            return (
              <ShelfGridCard
                key={shelf.locationId ?? shelf.name}
                shelf={shelf}
                t={tCard}
                locale={locale}
                locationTypeLabel={t(
                  LOCATION_TYPE_I18N[(shelf.locationType as LocationType) || "WAREHOUSE"] ??
                    LOCATION_TYPE_I18N.OTHER,
                )}
                onOpen={() => {
                  if (isCounting) closeShelfCount();
                  else openShelfCount(shelf);
                }}
                onCardClick={() => setDetailShelf(shelf)}
                onMenuAction={(action) => handleMenuAction(shelf, action)}
                busy={busyShelfName === shelf.name}
                entering={enteringNames.has(shelf.name)}
                canManage={canManage}
                noPermissionTitle={tCard("noPermission")}
                isCounting={isCounting}
                elapsedLabel={elapsed}
                targetMinutes={
                  session?.targetMinutes ?? shelfCountTargetMinutes(shelf.productCount)
                }
                countProgressPct={shelf.matchPct}
              />
            );
          })}
        </div>
      )}

      {detailShelf ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center"
          onClick={() => setDetailShelf(null)}
        >
          <div
            className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            <h3 className="text-lg font-black text-slate-900">{detailShelf.name}</h3>
            {detailShelf.description ? (
              <p className="mt-1 text-sm text-slate-600">{detailShelf.description}</p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs font-bold text-slate-500">{tW("kpiCountedProducts")}</dt>
                <dd className="font-black">{detailShelf.productCount}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-slate-500">
                  {t(COUNT_STATUS_I18N[detailShelf.countStatus ?? "NOT_STARTED"])}
                </dt>
                <dd className="font-black">{detailShelf.matchPct}%</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-bold text-slate-500">{tCard("lastCountAt", { date: "" }).split(":")[0]}</dt>
                <dd className="font-semibold text-slate-700">
                  {detailShelf.lastCountAt
                    ? new Date(detailShelf.lastCountAt).toLocaleString(locale)
                    : "—"}
                  {detailShelf.lastCountedByName ? ` · ${detailShelf.lastCountedByName}` : ""}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDetailShelf(null);
                  openShelfCount(detailShelf);
                }}
                className="flex-1 rounded-2xl bg-[#2563eb] py-2.5 text-sm font-black text-white"
              >
                {tCard("startCount")}
              </button>
              <button
                type="button"
                onClick={() => setDetailShelf(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ShelfCountModal
        open={modalShelf !== null}
        shelfName={modalShelf ?? ""}
        locationId={modalShelfId}
        countDate={countDate}
        onClose={closeShelfCount}
        onShelfStatsChange={loadShelves}
        t={(k, v) => t(`ops.inventory.warehouse.modal.${k}`, v)}
      />

      <ShelfAddProductsModal
        open={addProductsOpen && actionShelf !== null}
        shelfName={actionShelf?.name ?? ""}
        locationId={actionShelf?.locationId ?? null}
        countDate={countDate}
        onClose={() => {
          setAddProductsOpen(false);
          setActionShelf(null);
        }}
        onShelfUpdated={(summary) => upsertSummary(summary)}
      />

      <ShelfDeleteConfirmModal
        open={deleteOpen && actionShelf !== null}
        shelfName={actionShelf?.name ?? ""}
        busy={busyShelfName === actionShelf?.name}
        onCancel={() => {
          if (busyShelfName) return;
          setDeleteOpen(false);
          setActionShelf(null);
        }}
        onConfirm={() => void confirmDeleteShelf()}
      />

      <ShelfTransferModal
        open={transferOpen && actionShelf !== null}
        sourceName={actionShelf?.name ?? ""}
        sourceLocationId={actionShelf?.locationId ?? null}
        locations={shelfSummaries
          .filter((s) => s.locationId && s.isActive !== false)
          .map((s) => ({ id: s.locationId!, name: s.name }))}
        onClose={() => {
          setTransferOpen(false);
          setActionShelf(null);
        }}
        onTransferred={() => void loadShelves()}
        t={(k, v) => tW(`transfer.${k}`, v)}
      />

      <ShelfHistoryModal
        open={historyOpen && actionShelf !== null}
        shelfName={actionShelf?.name ?? ""}
        onClose={() => {
          setHistoryOpen(false);
          setActionShelf(null);
        }}
        t={(k) => tW(`history.${k}`)}
        locale={locale}
      />

      <LocationFormModal
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          showToast({
            tone: "success",
            title: formMode === "edit" ? tW("toast.updated") : tW("toast.created"),
            durationMs: 2200,
          });
          await loadShelves();
        }}
        t={(k) => t(`ops.inventory.warehouse.addShelf.${k}`)}
        tType={(lt) => t(LOCATION_TYPE_I18N[lt])}
      />
    </div>
  );
}
