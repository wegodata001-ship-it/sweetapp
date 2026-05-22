"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  Box,
  ChevronDown,
  Clock,
  Package,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  INVENTORY_MOVEMENT_KEYS,
  type InventoryMovementKey,
} from "@/lib/inventory/movement";
import type { StockFilterTier } from "@/lib/inventory/product-filters";
import { InventoryCountDashboard } from "@/components/ops/inventory-count-dashboard";
import { useI18n } from "@/components/i18n-provider";
import { translateInventoryCategory } from "@/lib/i18n/status-keys";
import type { TranslateFn } from "@/lib/i18n/translator";

/** מוצר מכירה — לתנועות יומיות בלבד */
type MovementProductPick = {
  id: string;
  name: string;
  currentStock: number;
};

/** שורת מצב מלאי — מקור: InventoryProduct + ספירה אחרונה */
type InventoryStockRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  locationId?: string | null;
  unit: string | null;
  currentQuantity: number | null;
  minimumQuantity: number;
  lastCountedAt: string | null;
  countedBy: { id: string; fullName: string; email: string } | null;
  status: "חסר" | "נמוך" | "תקין";
};

type Stats = {
  totalProducts: number;
  shortageCount: number;
  lowStockCount: number;
  pieOk: number;
  todayMovements: number;
  byLocation?: {
    key: string;
    name: string;
    total: number;
    shortage: number;
    low: number;
    zero: number;
  }[];
};

type Meta = {
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  users: { id: string; fullName: string; email: string; role: string }[];
};

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string };
  createdBy: { id: string; fullName: string; email: string } | null;
};

type InventoryCountProductRow = {
  id: string;
  name: string;
  location: string;
  locationId?: string | null;
  unit: string | null;
  previousQuantity: number;
  lastCountedAt: string | null;
};

type ManagedInventoryProductRow = {
  id: string;
  name: string;
  location: string;
  locationId?: string | null;
  category: string;
  minimumQuantity: number;
  unit: string | null;
  countsCount: number;
  createdAt: string;
};

type InventoryLocationPick = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type ShelfSummary = {
  name: string;
  productCount: number;
  shortageCount: number;
};

type ListMeta = { total: number; page: number; pageSize: number };

type InventoryCountHistoryRow = {
  id: string;
  countDate: string;
  /** מועד שמירת הרשומה — לסינון לפי שעה בשרת */
  createdAt?: string;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  note: string | null;
  countedBy?: { id: string; fullName: string; email: string } | null;
  product: {
    id: string;
    name: string;
    location: string;
    unit: string | null;
  };
};

type HistoryFetchOverrides = {
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
  productId?: string;
  countedByUserId?: string;
  onlyShortage?: boolean;
  onlySurplus?: boolean;
};

const TAB_IDS = ["monthly", "history", "products", "daily", "stock"] as const;
type TabId = (typeof TAB_IDS)[number];

function countDiffMeta(diff: number, t: TranslateFn) {
  if (diff < 0) {
    return {
      label: t("ops.inventory.count.diffShortage"),
      diffStyle: { color: "#dc2626" } as CSSProperties,
      badgeClass: "font-black",
      badgeStyle: { backgroundColor: "rgba(220, 38, 38, 0.12)", color: "#dc2626" } as CSSProperties,
    };
  }
  if (diff > 0) {
    return {
      label: t("ops.inventory.count.diffSurplus"),
      diffStyle: { color: "#16a34a" } as CSSProperties,
      badgeClass: "font-black",
      badgeStyle: { backgroundColor: "rgba(22, 163, 74, 0.12)", color: "#16a34a" } as CSSProperties,
    };
  }
  return {
    label: t("ops.inventory.count.diffNoChange"),
    diffStyle: { color: "#64748b" } as CSSProperties,
    badgeClass: "font-bold",
    badgeStyle: { backgroundColor: "rgba(100, 116, 139, 0.14)", color: "#64748b" } as CSSProperties,
  };
}

// קטגוריות נשמרות באנגלית מאחורי הקלעים — תרגום במסכי המשתמש בלבד
const INVENTORY_FILTER_CATEGORIES = ["חומרי גלם", "אריזות", "קירור", "מדבקות", "כללי", "מיקום"] as const;

const INV_SHEET_FILTERS_KEY = "wego-inv-sheet-filters";

function readSheetFilters(): {
  locationName: string;
  category: string;
  stock: StockFilterTier;
  q: string;
  countPage: number;
  managedPage: number;
} {
  const defaults = {
    locationName: "",
    category: "",
    stock: "all" as StockFilterTier,
    q: "",
    countPage: 1,
    managedPage: 1,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(INV_SHEET_FILTERS_KEY);
    if (!raw) return defaults;
    const j = JSON.parse(raw) as Partial<typeof defaults & { locationId?: string }>;
    const stock = (["all", "low", "short", "zero"] as const).includes(j.stock as StockFilterTier)
      ? (j.stock as StockFilterTier)
      : defaults.stock;
    return {
      ...defaults,
      ...j,
      stock,
      locationName: typeof j.locationName === "string" ? j.locationName : "",
      countPage: Math.max(1, Number(j.countPage) || 1),
      managedPage: Math.max(1, Number(j.managedPage) || 1),
    };
  } catch {
    return defaults;
  }
}

function inventoryStockPresentation(status: InventoryStockRow["status"], t: TranslateFn) {
  switch (status) {
    case "חסר":
      return {
        label: t("ops.inventory.stock.statusShort"),
        row: "bg-rose-50/75",
        badge: "bg-rose-100 text-rose-900",
      };
    case "נמוך":
      return {
        label: t("ops.inventory.stock.statusLow"),
        row: "bg-amber-50/55",
        badge: "bg-amber-100 text-amber-950",
      };
    default:
      return {
        label: t("ops.inventory.stock.statusOk"),
        row: "bg-emerald-50/45",
        badge: "bg-emerald-100 text-emerald-900",
      };
  }
}

function movementRowClass(type: string) {
  switch (type) {
    case "SHORTAGE":
      return "border-s-4 border-s-rose-500 bg-rose-50/30";
    case "STOCK_IN":
    case "RETURN":
      return "border-s-4 border-s-emerald-500 bg-emerald-50/25";
    case "DAMAGE":
      return "border-s-4 border-s-amber-500 bg-amber-50/25";
    case "STOCK_FIX":
      return "border-s-4 border-s-blue-600 bg-blue-50/25";
    default:
      return "border-s-4 border-s-slate-300 bg-slate-50/40";
  }
}

function movementActionLabel(type: string, t: TranslateFn) {
  const key = `ops.inventory.movementType.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

function formatTime(iso: string, bcp47: string) {
  try {
    return new Date(iso).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatHistoryCountDateParts(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { dateStr: "—", timeStr: "—" };
    const dateStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { dateStr, timeStr };
  } catch {
    return { dateStr: "—", timeStr: "—" };
  }
}

function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartMondayYmd(): string {
  const now = new Date();
  const dow = now.getDay();
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + monOffset);
  return localYmd(mon);
}

function formatDateTime(iso: string | null | undefined, bcp47: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(bcp47, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function InventoryPie({
  ok,
  low,
  shortage,
  t,
}: {
  ok: number;
  low: number;
  shortage: number;
  t: TranslateFn;
}) {
  const total = ok + low + shortage;
  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm font-semibold text-slate-500">
        {t("ops.inventory.pie.noProducts")}
      </p>
    );
  }
  const a = (ok / total) * 360;
  const b = a + (low / total) * 360;
  const bg = `conic-gradient(
    rgb(16 185 129) 0deg ${a}deg,
    rgb(251 146 60) ${a}deg ${b}deg,
    rgb(239 68 68) ${b}deg 360deg
  )`;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div
        className="h-40 w-40 shrink-0 rounded-full border border-slate-200 shadow-inner"
        style={{ background: bg }}
        role="img"
        aria-label={t("ops.inventory.pie.aria")}
      />
      <ul className="space-y-2 text-sm font-bold text-slate-700">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
          {t("ops.inventory.pie.legendOk", { n: ok })}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden />
          {t("ops.inventory.pie.legendLow", { n: low })}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" aria-hidden />
          {t("ops.inventory.pie.legendShortage", { n: shortage })}
        </li>
      </ul>
    </div>
  );
}

export default function InventoryPage() {
  const { t, bcp47 } = useI18n();
  const TABS = useMemo(
    () => [
      { id: "monthly" as const, label: t("ops.inventory.tabs.monthly") },
      { id: "history" as const, label: t("ops.inventory.tabs.history") },
      { id: "products" as const, label: t("ops.inventory.tabs.products") },
      { id: "daily" as const, label: t("ops.inventory.tabs.daily") },
      { id: "stock" as const, label: t("ops.inventory.tabs.stock") },
    ],
    [t],
  );
  const [tab, setTab] = useState<TabId>("monthly");
  const [stats, setStats] = useState<Stats | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [countProducts, setCountProducts] = useState<InventoryCountProductRow[]>([]);
  const [managedCountProducts, setManagedCountProducts] = useState<ManagedInventoryProductRow[]>([]);
  const [historyRows, setHistoryRows] = useState<InventoryCountHistoryRow[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [newCountProduct, setNewCountProduct] = useState({
    name: "",
    locationId: "",
    unit: "",
    category: "כללי",
  });
  const [addInventoryOpen, setAddInventoryOpen] = useState(false);
  const [countRefreshKey, setCountRefreshKey] = useState(0);
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyTimeFrom, setHistoryTimeFrom] = useState("");
  const [historyTimeTo, setHistoryTimeTo] = useState("");
  const [historyProductId, setHistoryProductId] = useState("");
  const [historyCountedByUserId, setHistoryCountedByUserId] = useState("");
  const [historyEmployeeQuery, setHistoryEmployeeQuery] = useState("");
  const [historyEmployeeSuggest, setHistoryEmployeeSuggest] = useState(false);
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(false);
  const [historyOnlyShortage, setHistoryOnlyShortage] = useState(false);
  const [historyOnlySurplus, setHistoryOnlySurplus] = useState(false);
  const historyEmployeeWrapRef = useRef<HTMLDivElement>(null);

  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productQuery, setProductQuery] = useState("");
  const [productPick, setProductPick] = useState<MovementProductPick | null>(null);
  const [suggestions, setSuggestions] = useState<MovementProductPick[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);
  const countFilterSigRef = useRef("");
  const [movType, setMovType] = useState<InventoryMovementKey>("STOCK_IN");
  const [movQty, setMovQty] = useState("1");
  const [movUserId, setMovUserId] = useState("");
  const [movNote, setMovNote] = useState("");

  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filterInventoryCategory, setFilterInventoryCategory] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stockLocationId, setStockLocationId] = useState("");
  const [stockTierFilter, setStockTierFilter] = useState<StockFilterTier>("all");

  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocationPick[]>([]);
  const [shelfSummaries, setShelfSummaries] = useState<ShelfSummary[]>([]);
  const [countLocationName, setCountLocationName] = useState("");
  const [countCategory, setCountCategory] = useState("");
  const [countStock, setCountStock] = useState<StockFilterTier>("all");
  const [countQ, setCountQ] = useState("");
  const [debouncedCountQ, setDebouncedCountQ] = useState("");
  const [countPage, setCountPage] = useState(1);
  const [countMeta, setCountMeta] = useState<ListMeta | null>(null);
  const [managedPage, setManagedPage] = useState(1);
  const [managedMeta, setManagedMeta] = useState<ListMeta | null>(null);
  const [countFiltersOpen, setCountFiltersOpen] = useState(false);
  const [historyProductPicklist, setHistoryProductPicklist] = useState<{ id: string; name: string }[]>([]);

  const [stockMovementModalId, setStockMovementModalId] = useState<string | null>(null);
  const [stockMovementRows, setStockMovementRows] = useState<InventoryCountHistoryRow[]>([]);
  const [stockMovementLoading, setStockMovementLoading] = useState(false);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/inventory/stats", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: Stats };
    if (j.data) setStats(j.data);
  }, []);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/inventory/meta", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: Meta };
    if (j.data) setMeta(j.data);
  }, []);

  const loadInventoryLocations = useCallback(async () => {
    const res = await fetch("/api/inventory/locations", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryLocationPick[] };
    setInventoryLocations((j.data ?? []).filter((x) => x.isActive));
  }, []);

  const loadShelfSummaries = useCallback(async () => {
    const res = await fetch("/api/inventory/shelf-summaries", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ShelfSummary[] };
    setShelfSummaries(j.data ?? []);
  }, []);

  const loadCountProducts = useCallback(async () => {
    if (!countLocationName.trim()) {
      setCountProducts([]);
      setCountMeta({ total: 0, page: 1, pageSize: 100 });
      return;
    }
    const params = new URLSearchParams();
    params.set("location", countLocationName.trim());
    if (debouncedCountQ) params.set("q", debouncedCountQ);
    if (countCategory) params.set("category", countCategory);
    if (countStock !== "all") params.set("stock", countStock);
    params.set("page", String(countPage));
    params.set("pageSize", "100");
    const res = await fetch(`/api/inventory/monthly-count?${params}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryCountProductRow[]; meta?: ListMeta };
    setCountProducts(j.data ?? []);
    if (j.meta) setCountMeta(j.meta);
  }, [countLocationName, debouncedCountQ, countCategory, countStock, countPage]);

  const loadManagedCountProducts = useCallback(async () => {
    if (!countLocationName.trim()) {
      setManagedCountProducts([]);
      setManagedMeta({ total: 0, page: 1, pageSize: 50 });
      return;
    }
    const params = new URLSearchParams();
    params.set("location", countLocationName.trim());
    if (debouncedCountQ) params.set("q", debouncedCountQ);
    if (countCategory) params.set("category", countCategory);
    if (countStock !== "all") params.set("stock", countStock);
    params.set("page", String(managedPage));
    params.set("pageSize", "50");
    const res = await fetch(`/api/inventory/count-products?${params}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ManagedInventoryProductRow[]; meta?: ListMeta };
    setManagedCountProducts(j.data ?? []);
    if (j.meta) setManagedMeta(j.meta);
  }, [countLocationName, debouncedCountQ, countCategory, countStock, managedPage]);

  const loadCountHistory = useCallback(
    async (override?: HistoryFetchOverrides) => {
      const dateFrom = override?.dateFrom ?? historyDateFrom;
      const dateTo = override?.dateTo ?? historyDateTo;
      const timeFrom = override?.timeFrom ?? historyTimeFrom;
      const timeTo = override?.timeTo ?? historyTimeTo;
      const productId = override?.productId ?? historyProductId;
      const countedByUserId = override?.countedByUserId ?? historyCountedByUserId;
      const onlyShortage = override?.onlyShortage ?? historyOnlyShortage;
      const onlySurplus = override?.onlySurplus ?? historyOnlySurplus;

      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (timeFrom) params.set("timeFrom", timeFrom);
      if (timeTo) params.set("timeTo", timeTo);
      if (productId) params.set("productId", productId);
      if (countedByUserId) params.set("countedByUserId", countedByUserId);
      if (onlyShortage) params.set("onlyShortage", "1");
      if (onlySurplus) params.set("onlySurplus", "1");
      const res = await fetch(`/api/inventory/count-history?${params.toString()}`, { credentials: "same-origin" });
      const j = (await res.json()) as { data?: InventoryCountHistoryRow[] };
      setHistoryRows(j.data ?? []);
    },
    [
      historyDateFrom,
      historyDateTo,
      historyTimeFrom,
      historyTimeTo,
      historyProductId,
      historyCountedByUserId,
      historyOnlyShortage,
      historyOnlySurplus,
    ],
  );

  const historyUserSuggestions = useMemo(() => {
    const users = meta?.users ?? [];
    const q = historyEmployeeQuery.trim().toLowerCase();
    const sorted = [...users].sort((a, b) =>
      (a.fullName ?? "").localeCompare(b.fullName ?? "", undefined, { sensitivity: "base" }),
    );
    if (!q) return sorted.slice(0, 60);
    return sorted
      .filter(
        (u) =>
          (u.fullName ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.role ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [meta?.users, historyEmployeeQuery]);

  useEffect(() => {
    if (!historyEmployeeSuggest) return;
    function onDoc(e: MouseEvent) {
      if (!historyEmployeeWrapRef.current?.contains(e.target as Node)) setHistoryEmployeeSuggest(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [historyEmployeeSuggest]);

  const loadMovements = useCallback(async (date: string) => {
    const res = await fetch(`/api/inventory/movements?date=${encodeURIComponent(date)}`, {
      credentials: "same-origin",
    });
    const j = (await res.json()) as { data?: MovementRow[] };
    setMovements(j.data ?? []);
  }, []);

  const loadStock = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (filterInventoryCategory) params.set("category", filterInventoryCategory);
    if (stockLocationId) params.set("locationId", stockLocationId);
    if (stockTierFilter !== "all") params.set("stock", stockTierFilter);
    params.set("page", "1");
    params.set("pageSize", "200");
    const res = await fetch(`/api/inventory/stock?${params.toString()}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryStockRow[]; meta?: ListMeta };
    setStockRows(j.data ?? []);
  }, [debouncedQ, filterInventoryCategory, stockLocationId, stockTierFilter]);

  const openInventoryMovementModal = useCallback(async (inventoryProductId: string) => {
    setStockMovementModalId(inventoryProductId);
    setStockMovementLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/count-history?productId=${encodeURIComponent(inventoryProductId)}`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as { data?: InventoryCountHistoryRow[] };
      setStockMovementRows(j.data ?? []);
    } finally {
      setStockMovementLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      await Promise.all([
        loadStats(),
        loadMeta(),
        loadInventoryLocations(),
        loadShelfSummaries(),
        loadCountHistory(),
        loadMovements(movementDate),
        loadStock(),
      ]);
    } catch {
      setLoadError(t("ops.inventory.errors.load"));
    }
  }, [
    loadCountHistory,
    loadInventoryLocations,
    loadMeta,
    loadMovements,
    loadShelfSummaries,
    loadStats,
    loadStock,
    movementDate,
    t,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshAll();
    });
  }, [refreshAll]);

  useLayoutEffect(() => {
    const s = readSheetFilters();
    setCountLocationName(s.locationName);
    setCountCategory(s.category);
    setCountStock(s.stock);
    setCountQ(s.q);
    setDebouncedCountQ(s.q.trim());
    setCountPage(s.countPage);
    setManagedPage(s.managedPage);
    const sig = `${s.locationName}|${s.category}|${s.stock}|${s.q.trim()}`;
    countFilterSigRef.current = sig;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        INV_SHEET_FILTERS_KEY,
        JSON.stringify({
          locationName: countLocationName,
          category: countCategory,
          stock: countStock,
          q: countQ,
          countPage,
          managedPage,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [countLocationName, countCategory, countStock, countQ, countPage, managedPage]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedCountQ(countQ.trim()), 320);
    return () => window.clearTimeout(t);
  }, [countQ]);

  useEffect(() => {
    const sig = `${countLocationName}|${countCategory}|${countStock}|${debouncedCountQ}`;
    if (countFilterSigRef.current !== "" && countFilterSigRef.current !== sig) {
      setCountPage(1);
      setManagedPage(1);
    }
    countFilterSigRef.current = sig;
  }, [countLocationName, countCategory, countStock, debouncedCountQ]);

  useEffect(() => {
    if (countLocationName.trim()) return;
    if (!inventoryLocations.length) return;
    try {
      const raw = localStorage.getItem(INV_SHEET_FILTERS_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as { locationId?: string; locationName?: string };
      if (typeof j.locationName === "string" && j.locationName.trim()) return;
      if (j.locationId && typeof j.locationId === "string") {
        const n = inventoryLocations.find((l) => l.id === j.locationId)?.name;
        if (n?.trim()) setCountLocationName(n.trim());
      }
    } catch {
      /* ignore */
    }
  }, [inventoryLocations, countLocationName]);

  useEffect(() => {
    if (tab !== "monthly") return;
    queueMicrotask(() => {
      void loadCountProducts();
    });
  }, [tab, loadCountProducts]);

  useEffect(() => {
    if (tab !== "products") return;
    queueMicrotask(() => {
      void loadManagedCountProducts();
    });
  }, [tab, loadManagedCountProducts]);

  useEffect(() => {
    if (tab !== "history") return;
    void (async () => {
      const res = await fetch("/api/inventory/count-products?pageSize=400&page=1", {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { data?: { id: string; name: string }[] };
      setHistoryProductPicklist((j.data ?? []).map((r) => ({ id: r.id, name: r.name })));
    })();
  }, [tab]);

  useEffect(() => {
    if (meta?.users.length && movUserId === "") {
      queueMicrotask(() => setMovUserId(meta.users[0].id));
    }
  }, [meta, movUserId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filterQ), 320);
    return () => window.clearTimeout(t);
  }, [filterQ]);

  useEffect(() => {
    if (tab === "stock") {
      queueMicrotask(() => {
        void loadStock();
      });
    }
  }, [tab, loadStock]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMovements(movementDate);
    });
  }, [movementDate, loadMovements]);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 1) {
      queueMicrotask(() => setSuggestions([]));
      return;
    }
    const id = window.setTimeout(async () => {
      const res = await fetch(`/api/inventory/movement-products?q=${encodeURIComponent(q)}&limit=12`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { data?: MovementProductPick[] };
      setSuggestions(j.data ?? []);
      setShowSuggest(true);
    }, 200);
    return () => window.clearTimeout(id);
  }, [productQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!suggestRef.current?.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const monthlyRows = useMemo(() => {
    return countProducts.map((p) => {
      const raw = actualById[p.id] ?? "";
      const actual = raw === "" ? null : Number(raw);
      const diff = actual === null || Number.isNaN(actual) ? null : actual - p.previousQuantity;
      return { ...p, raw, actual, diff };
    });
  }, [countProducts, actualById]);

  const saveMonthly = async () => {
    if (!countLocationName.trim()) {
      setNotice(t("ops.inventory.notice.chooseLocationFirst"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const lines = monthlyRows
        .filter((r) => r.actual !== null && !Number.isNaN(r.actual))
        .map((r) => ({
          inventoryProductId: r.id,
          currentQuantity: r.actual as number,
          note: notesById[r.id]?.trim() || null,
        }));
      if (lines.length === 0) {
        setNotice(t("ops.inventory.errors.noSheetItem"));
        setBusy(false);
        return;
      }
      const res = await fetch("/api/inventory/monthly-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          countDate,
          lines,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.inventory.notice.saveFailed"));
        setBusy(false);
        return;
      }
      setNotice(t("ops.inventory.notice.saved", { count: lines.length }));
      setActualById({});
      setNotesById({});
      setCountRefreshKey((k) => k + 1);
      await Promise.all([loadStats(), loadCountProducts(), loadCountHistory(), loadShelfSummaries()]);
    } catch {
      setNotice(t("ops.inventory.notice.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const resetCountSheetFilters = () => {
    setCountLocationName("");
    setCountCategory("");
    setCountStock("all");
    setCountQ("");
    setDebouncedCountQ("");
    setCountPage(1);
    setManagedPage(1);
  };

  const createCountProduct = async () => {
    if (!newCountProduct.name.trim()) {
      setNotice(t("ops.inventory.notice.missingName"));
      return;
    }
    if (!newCountProduct.locationId) {
      setNotice(t("ops.inventory.notice.chooseLocation"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/inventory/count-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: newCountProduct.name.trim(),
          locationId: newCountProduct.locationId,
          unit: newCountProduct.unit.trim() || null,
          category: newCountProduct.category.trim() || "כללי",
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.inventory.notice.itemCreateFailed"));
        return;
      }
      setNewCountProduct({ name: "", locationId: "", unit: "", category: "כללי" });
      setAddInventoryOpen(false);
      setNotice(t("ops.inventory.notice.itemAdded"));
      await Promise.all([
        loadCountProducts(),
        loadManagedCountProducts(),
        loadStats(),
        loadInventoryLocations(),
        loadShelfSummaries(),
      ]);
    } catch {
      setNotice(t("ops.inventory.notice.itemCreateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submitMovement = async () => {
    if (!productPick) {
      setNotice(t("ops.inventory.notice.pickProduct"));
      return;
    }
    const qn = Number(movQty);
    if (!Number.isFinite(qn)) {
      setNotice(t("ops.inventory.notice.invalidQty"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productId: productPick.id,
          type: movType,
          quantity: qn,
          notes: movNote.trim() || null,
          performedByUserId: movUserId || undefined,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? t("ops.inventory.notice.saveFailed"));
        setBusy(false);
        return;
      }
      setNotice(t("ops.inventory.notice.movementSaved"));
      setMovNote("");
      setMovQty("1");
      setProductPick(null);
      setProductQuery("");
      await Promise.all([loadStats(), loadCountProducts(), loadMovements(movementDate), loadStock()]);
    } catch {
      setNotice(t("ops.inventory.notice.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";
  const labelClass = "block text-xs font-bold text-slate-600";

  const activeShelfLabel = countLocationName.trim();

  const resolveLocationIdForShelf = useMemo(() => {
    return (name: string) =>
      inventoryLocations.find((l) => l.name.trim() === name.trim())?.id ?? "";
  }, [inventoryLocations]);

  const countListTotal = countMeta?.total ?? countProducts.length;
  const countSheetEmpty = !activeShelfLabel || countListTotal === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-[14px] pb-6" dir="rtl">
      {tab !== "monthly" ? (
      <section className="app-panel mb-[14px] px-5 py-6 md:px-7 md:py-7">
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-luxury-navy-rich opacity-80">
          <Package className="h-4 w-4 shrink-0 text-luxury-gold" aria-hidden />
          {t("ops.inventory.kicker")}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <h1 className="erp-page-title text-slate-950">{t("ops.inventory.pageTitle")}</h1>
        </div>
        <p className="mt-1 max-w-3xl text-[15px] leading-snug text-slate-600 opacity-80">
          {t("ops.inventory.pageDescription")}
        </p>
      </section>
      ) : null}
      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700" role="alert">
          {loadError}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {notice}
        </p>
      ) : null}

      {tab !== "monthly" ? (
      <div className="space-y-[14px]">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-luxury-navy-rich/15 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">{t("ops.inventory.kpi.totalItems")}</p>
            <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
              <Box className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-luxury-navy-rich md:text-3xl">
            {stats?.totalProducts ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("ops.inventory.kpi.itemsInSystem")}</p>
        </div>
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-rose-200/80 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">{t("ops.inventory.kpi.shortage")}</p>
            <span className="rounded-xl bg-rose-50 p-2 text-rose-600">
              <ArrowDownRight className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-rose-700 md:text-3xl">
            {stats?.shortageCount ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("ops.inventory.kpi.shortage")}</p>
        </div>
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-amber-200/80 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">{t("ops.inventory.kpi.lowStock")}</p>
            <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-amber-800 md:text-3xl">
            {stats?.lowStockCount ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("ops.inventory.kpi.almostOut")}</p>
        </div>
        <div className="app-panel col-span-2 flex min-h-[120px] flex-col justify-between border-emerald-200/80 p-4 shadow-luxury-sm md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">{t("ops.inventory.kpi.todayMovements")}</p>
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-emerald-800 md:text-3xl">
            {stats?.todayMovements ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("ops.inventory.kpi.todayMovementsTrend")}</p>
        </div>
      </div>

      <div className="app-panel p-4 md:p-5">
        <h2 className="text-sm font-black text-slate-900">{t("ops.inventory.byLocation.title")}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">{t("ops.inventory.byLocation.shelfFilterHint")}</p>
        {shelfSummaries.length > 0 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3 xl:grid-cols-4">
            {shelfSummaries.map((shelf) => {
              const shelfActive = countLocationName.trim() === shelf.name.trim();
              return (
                <button
                  key={shelf.name}
                  type="button"
                  onClick={() => {
                    setCountLocationName(shelf.name);
                    setTab("monthly");
                  }}
                  className={`shrink-0 rounded-2xl px-3 py-2.5 text-right transition ${
                    shelfActive
                      ? "border-2 border-sky-400 bg-sky-100 font-black text-slate-900 shadow-[0_0_14px_rgba(56,189,248,0.35)] ring-1 ring-sky-200/80"
                      : "border border-slate-200 bg-white font-bold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm">{shelf.name}</span>
                  <span className="mt-0.5 block text-[11px] font-bold tabular-nums text-slate-600">
                    ({shelf.productCount})
                  </span>
                  {shelf.shortageCount > 0 ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-rose-600">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                      {shelf.shortageCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-slate-600">{t("ops.inventory.byLocation.emptyShelves")}</p>
        )}
      </div>
      </div>
      ) : null}

      <div className="app-panel px-2 pt-2 md:px-4">
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-3 text-sm font-black transition ${
                tab === t.id ? "text-luxury-navy-rich" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {tab === t.id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-luxury-navy-rich" />
              ) : null}
            </button>
          ))}
        </div>

        <div className={tab === "monthly" ? "p-2 md:p-3" : "p-4 md:p-6"}>
          {tab === "monthly" ? <InventoryCountDashboard /> : null}

          {tab === "history" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  {t("ops.inventory.history.quickRange")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const d = localYmd(new Date());
                    setHistoryDateFrom(d);
                    setHistoryDateTo(d);
                    setHistoryTimeFrom("");
                    setHistoryTimeTo("");
                    void loadCountHistory({ dateFrom: d, dateTo: d, timeFrom: "", timeTo: "" });
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {t("ops.inventory.history.chipToday")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    const d = localYmd(y);
                    setHistoryDateFrom(d);
                    setHistoryDateTo(d);
                    setHistoryTimeFrom("");
                    setHistoryTimeTo("");
                    void loadCountHistory({ dateFrom: d, dateTo: d, timeFrom: "", timeTo: "" });
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {t("ops.inventory.history.chipYesterday")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = weekStartMondayYmd();
                    const end = localYmd(new Date());
                    setHistoryDateFrom(start);
                    setHistoryDateTo(end);
                    setHistoryTimeFrom("");
                    setHistoryTimeTo("");
                    void loadCountHistory({ dateFrom: start, dateTo: end, timeFrom: "", timeTo: "" });
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {t("ops.inventory.history.chipWeek")}
                </button>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-luxury-navy-rich shadow-sm md:hidden"
                onClick={() => setHistoryFiltersOpen((o) => !o)}
                aria-expanded={historyFiltersOpen}
              >
                {t("ops.inventory.history.filtersToggle")}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition ${historyFiltersOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              <div
                className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 ${historyFiltersOpen ? "" : "hidden"} md:block`}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 xl:items-end">
                  <label className="min-w-0 sm:col-span-1 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.dateFrom")}</span>
                    <input
                      type="date"
                      value={historyDateFrom}
                      onChange={(e) => setHistoryDateFrom(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="min-w-0 sm:col-span-1 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.dateTo")}</span>
                    <input
                      type="date"
                      value={historyDateTo}
                      onChange={(e) => setHistoryDateTo(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="min-w-0 sm:col-span-1 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.timeFrom")}</span>
                    <input
                      type="time"
                      value={historyTimeFrom}
                      onChange={(e) => setHistoryTimeFrom(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="min-w-0 sm:col-span-1 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.timeTo")}</span>
                    <input
                      type="time"
                      value={historyTimeTo}
                      onChange={(e) => setHistoryTimeTo(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div ref={historyEmployeeWrapRef} className="relative min-w-0 sm:col-span-2 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.byEmployee")}</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={historyEmployeeQuery}
                        onChange={(e) => {
                          setHistoryEmployeeQuery(e.target.value);
                          setHistoryEmployeeSuggest(true);
                          setHistoryCountedByUserId("");
                        }}
                        onFocus={() => setHistoryEmployeeSuggest(true)}
                        className={`${inputClass} pe-10`}
                        placeholder={t("ops.inventory.history.employeePlaceholder")}
                        autoComplete="off"
                      />
                      {historyCountedByUserId ? (
                        <button
                          type="button"
                          className="absolute start-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => {
                            setHistoryCountedByUserId("");
                            setHistoryEmployeeQuery("");
                          }}
                          aria-label={t("ops.inventory.history.clearEmployee")}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    {historyEmployeeSuggest && historyUserSuggestions.length > 0 ? (
                      <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                        {historyUserSuggestions.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-right text-sm font-semibold text-slate-800 hover:bg-slate-50"
                              onClick={() => {
                                setHistoryCountedByUserId(u.id);
                                setHistoryEmployeeQuery(u.fullName);
                                setHistoryEmployeeSuggest(false);
                              }}
                            >
                              <span>{u.fullName}</span>
                              <span className="text-[11px] font-bold text-slate-400">{u.role}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label className="min-w-0 sm:col-span-2 xl:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.history.byProduct")}</span>
                    <select
                      value={historyProductId}
                      onChange={(e) => setHistoryProductId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">{t("ops.inventory.history.allProducts")}</option>
                      {historyProductPicklist.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-3">
                    <span className={`${labelClass} w-full`}>{t("ops.inventory.history.statusFilter")}</span>
                    <button
                      type="button"
                      aria-pressed={historyOnlyShortage}
                      onClick={() => {
                        setHistoryOnlyShortage((s) => {
                          const next = !s;
                          if (next) setHistoryOnlySurplus(false);
                          return next;
                        });
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                        historyOnlyShortage
                          ? "border-rose-500 bg-rose-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-rose-800 hover:bg-rose-50/80"
                      }`}
                    >
                      {t("ops.inventory.history.onlyShortage")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={historyOnlySurplus}
                      onClick={() => {
                        setHistoryOnlySurplus((s) => {
                          const next = !s;
                          if (next) setHistoryOnlyShortage(false);
                          return next;
                        });
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                        historyOnlySurplus
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-emerald-900 hover:bg-emerald-50/80"
                      }`}
                    >
                      {t("ops.inventory.history.onlySurplus")}
                    </button>
                  </div>
                  <div className="flex sm:col-span-2 xl:col-span-12 xl:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFiltersOpen(false);
                        void loadCountHistory();
                      }}
                      className="w-full rounded-xl bg-luxury-navy-rich px-5 py-3 text-sm font-black text-white hover:bg-luxury-charcoal sm:w-auto xl:min-w-[10rem]"
                    >
                      {t("ops.inventory.history.applyFilter")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="erp-table-scroll rounded-2xl border border-slate-200">
                <div className="max-h-[min(70vh,680px)] overflow-y-auto">
                  <table className="min-w-[920px] w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thDate")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thItem")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thLocation")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thPrevious")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thNew")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thDiff")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thEmployee")}</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-slate-700">{t("ops.inventory.history.thNote")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {historyRows.map((row) => {
                        const dm = countDiffMeta(row.difference, t);
                        const { dateStr, timeStr } = formatHistoryCountDateParts(row.countDate);
                        return (
                          <tr key={row.id} className="transition hover:bg-slate-50/80">
                            <td className="px-3 py-2 align-top text-xs font-semibold text-slate-800">
                              <span className="block font-black leading-tight">{dateStr}</span>
                              <span className="mt-0.5 block tabular-nums text-[11px] font-bold text-slate-500">{timeStr}</span>
                            </td>
                            <td className="px-3 py-2 align-top font-bold text-slate-900">{row.product.name}</td>
                            <td className="max-w-[10rem] px-3 py-2 align-top text-xs font-semibold text-slate-600">
                              {row.product.location || "—"}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums text-xs font-semibold text-slate-800">
                              {row.previousQuantity}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums text-sm font-black text-slate-900">{row.currentQuantity}</td>
                            <td className="px-3 py-2 align-top">
                              <span className="text-sm font-bold tabular-nums" style={dm.diffStyle}>
                                {row.difference > 0 ? "+" : ""}
                                {row.difference}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-slate-600">{row.countedBy?.fullName ?? "—"}</td>
                            <td className="max-w-[8rem] px-3 py-2 align-top text-xs text-slate-600">{row.note ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "products" ? (
            <div className="space-y-5">
              <p className="text-xs font-semibold text-slate-500 md:text-sm">
                {!activeShelfLabel
                  ? t("ops.inventory.products.pickAreaFirst")
                  : t("ops.inventory.products.filteredByArea", { area: activeShelfLabel })}
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-sm font-black text-slate-900">{t("ops.inventory.products.addTitle")}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                  <label className="lg:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.products.fieldItemNameRequired")}</span>
                    <input
                      value={newCountProduct.name}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, name: e.target.value }))}
                      className={inputClass}
                      placeholder={t("ops.inventory.products.fieldItemNamePlaceholder")}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.products.fieldLocationRequired")}</span>
                    <select
                      value={newCountProduct.locationId}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, locationId: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">{t("ops.inventory.products.fieldChoose")}</option>
                      {inventoryLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <datalist id="wego-inv-loc-ac-products">
                      {inventoryLocations.map((loc) => (
                        <option key={loc.id} value={loc.name} />
                      ))}
                    </datalist>
                    <input
                      className={`${inputClass} mt-1.5 !min-h-9 text-xs`}
                      list="wego-inv-loc-ac-products"
                      placeholder={t("ops.inventory.count.fieldLocationAutocompletePlaceholder")}
                      aria-label={t("ops.inventory.count.fieldLocationAutocompleteAria")}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) return;
                        const hit = inventoryLocations.find((l) => l.name.trim() === v);
                        if (hit) {
                          setNewCountProduct((p) => ({ ...p, locationId: hit.id }));
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.filter.category")}</span>
                    <select
                      value={newCountProduct.category}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, category: e.target.value }))}
                      className={inputClass}
                    >
                      {INVENTORY_FILTER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {translateInventoryCategory(t, c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.count.fieldUnit")}</span>
                    <input
                      value={newCountProduct.unit}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, unit: e.target.value }))}
                      className={inputClass}
                      placeholder={t("ops.inventory.products.fieldUnitPlaceholder")}
                    />
                  </label>
                  <div className="flex items-end lg:col-span-5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createCountProduct()}
                      className="rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal hover:bg-luxury-gold-hover disabled:opacity-50"
                    >
                      {t("ops.inventory.products.addBtn")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thItem")}</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thCategory")}</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thLocation")}</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thUnit")}</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thMin")}</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.products.thCounts")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {managedCountProducts.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{translateInventoryCategory(t, row.category)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{row.location}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{row.unit ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-xs text-slate-700">{row.minimumQuantity}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{row.countsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {managedCountProducts.map((row) => (
                  <div key={row.id} className="app-panel-muted space-y-2 p-4 shadow-none">
                    <p className="font-black text-slate-950">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {translateInventoryCategory(t, row.category)} · {row.location} · {row.unit ?? "—"}
                    </p>
                    <p className="text-xs font-bold text-slate-700">
                      {t("ops.inventory.products.mobileMinCounts", { min: row.minimumQuantity, counts: row.countsCount })}
                    </p>
                  </div>
                ))}
              </div>
              {managedMeta && managedMeta.total > managedMeta.pageSize ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs font-bold text-slate-600">
                    {t("ops.inventory.pagination.summary", {
                      total: managedMeta.total,
                      page: managedMeta.page,
                      totalPages: Math.max(1, Math.ceil(managedMeta.total / managedMeta.pageSize)),
                    })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={managedPage <= 1}
                      onClick={() => setManagedPage((p) => Math.max(1, p - 1))}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 disabled:opacity-40"
                    >
                      {t("ops.inventory.pagination.previous")}
                    </button>
                    <button
                      type="button"
                      disabled={managedPage >= Math.ceil(managedMeta.total / managedMeta.pageSize)}
                      onClick={() => setManagedPage((p) => p + 1)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 disabled:opacity-40"
                    >
                      {t("ops.inventory.pagination.next")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "daily" ? (
            <div className="space-y-6">
              <div className="app-panel-muted space-y-4 p-4 md:p-5">
                <h3 className="text-sm font-black text-slate-900">{t("ops.inventory.daily.addMovement")}</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className="md:col-span-2 lg:col-span-1">
                    <span className={labelClass}>{t("ops.inventory.daily.dateLabel")}</span>
                    <input
                      type="date"
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="relative md:col-span-2" ref={suggestRef}>
                    <span className={labelClass}>{t("ops.inventory.daily.itemPick")}</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={productPick ? productPick.name : productQuery}
                        onChange={(e) => {
                          setProductPick(null);
                          setProductQuery(e.target.value);
                        }}
                        onFocus={() => productQuery.trim() && setShowSuggest(true)}
                        className={`${inputClass} pe-10`}
                        placeholder={t("ops.inventory.daily.itemPickPlaceholder")}
                        autoComplete="off"
                      />
                    </div>
                    {showSuggest && suggestions.length > 0 ? (
                      <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-luxury">
                        {suggestions.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start px-3 py-2 text-right hover:bg-slate-50"
                              onClick={() => {
                                setProductPick(s);
                                setProductQuery("");
                                setShowSuggest(false);
                              }}
                            >
                              <span className="font-bold text-slate-900">{s.name}</span>
                              <span className="text-xs text-slate-500">{t("ops.inventory.daily.itemStock", { stock: s.currentStock })}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.daily.movementType")}</span>
                    <select
                      value={movType}
                      onChange={(e) => setMovType(e.target.value as InventoryMovementKey)}
                      className={inputClass}
                    >
                      {INVENTORY_MOVEMENT_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {t(`ops.inventory.movementType.${k}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.daily.quantity")} {movType === "STOCK_FIX" ? t("ops.inventory.daily.quantityFixSuffix") : ""}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={movQty}
                      onChange={(e) => setMovQty(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.daily.userPerformed")}</span>
                    <select
                      value={movUserId}
                      onChange={(e) => setMovUserId(e.target.value)}
                      className={inputClass}
                    >
                      {(meta?.users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.role})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="md:col-span-2 lg:col-span-3">
                    <span className={labelClass}>{t("ops.inventory.daily.note")}</span>
                    <input
                      type="text"
                      value={movNote}
                      onChange={(e) => setMovNote(e.target.value)}
                      className={inputClass}
                      placeholder={t("ops.inventory.daily.notePlaceholder")}
                    />
                  </label>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  <Clock className="me-1 inline h-3.5 w-3.5" aria-hidden />
                  {t("ops.inventory.daily.autoSaveHint")}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitMovement()}
                  className="inline-flex items-center justify-center rounded-xl bg-luxury-navy-rich px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-luxury-charcoal disabled:opacity-50"
                >
                  {t("ops.inventory.daily.saveMovement")}
                </button>
              </div>

              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[min(60vh,560px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thTime")}</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thItem")}</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thAction")}</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thQuantity")}</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thUser")}</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">{t("ops.inventory.daily.thNote")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {movements.map((m) => (
                        <tr key={m.id} className={`${movementRowClass(m.type)} transition hover:bg-white/60`}>
                          <td className="px-4 py-3 tabular-nums font-semibold text-slate-700">
                            {formatTime(m.createdAt, bcp47)}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900">{m.product.name}</td>
                          <td className="px-4 py-3 text-xs font-black text-slate-800">
                            {movementActionLabel(m.type, t)}
                          </td>
                          <td className="px-4 py-3 font-bold tabular-nums text-slate-900">{m.quantity}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                            {m.createdBy?.fullName ?? "—"}
                          </td>
                          <td className="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-500">
                            {m.notes ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {movements.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("ops.inventory.daily.empty")}</p>
                ) : (
                  movements.map((m) => (
                    <div
                      key={m.id}
                      className={`app-panel space-y-2 p-4 ${movementRowClass(m.type)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-slate-900">{m.product.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{formatTime(m.createdAt, bcp47)}</span>
                      </div>
                      <p className="text-xs font-black text-luxury-navy-rich">{movementActionLabel(m.type, t)}</p>
                      <p className="text-sm font-bold">{t("ops.inventory.daily.thQuantity")}: {m.quantity}</p>
                      <p className="text-xs text-slate-600">{m.createdBy?.fullName ?? "—"}</p>
                      {m.notes ? <p className="text-xs text-slate-500">{m.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {tab === "stock" ? (
            <div className="space-y-6">
              {stockMovementModalId ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stock-movement-modal-title"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setStockMovementModalId(null);
                  }}
                >
                  <div className="flex max-h-[min(85vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div>
                        <h4 id="stock-movement-modal-title" className="text-sm font-black text-slate-900">
                          {t("ops.inventory.stock.modalTitle")}
                        </h4>
                        <p className="text-xs font-semibold text-slate-500">
                          {stockRows.find((r) => r.id === stockMovementModalId)?.name ?? ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStockMovementModalId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100"
                      >
                        {t("ops.inventory.stock.close")}
                      </button>
                    </div>
                    <div className="min-h-[200px] overflow-auto p-3 text-[13px]">
                      {stockMovementLoading ? (
                        <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("ops.inventory.stock.loading")}</p>
                      ) : stockMovementRows.length === 0 ? (
                        <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("ops.inventory.stock.noCounts")}</p>
                      ) : (
                        <table className="w-full border-collapse text-right text-[13px]">
                          <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold text-slate-600">
                            <tr>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thDate")}</th>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thPrevious")}</th>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thNew")}</th>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thDiff")}</th>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thEmployee")}</th>
                              <th className="px-2 py-2">{t("ops.inventory.stock.thNote")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {stockMovementRows.map((h) => {
                              const dm = countDiffMeta(h.difference, t);
                              return (
                                <tr key={h.id} className="align-top">
                                  <td className="px-2 py-2 tabular-nums text-slate-700">{formatDateTime(h.countDate, bcp47)}</td>
                                  <td className="px-2 py-2 tabular-nums font-semibold">{h.previousQuantity}</td>
                                  <td className="px-2 py-2 tabular-nums font-black text-slate-900">{h.currentQuantity}</td>
                                  <td className="px-2 py-2 tabular-nums font-bold" style={dm.diffStyle}>
                                    {h.difference > 0 ? "+" : ""}
                                    {h.difference}
                                  </td>
                                  <td className="px-2 py-2 text-[11px] text-slate-600">{h.countedBy?.fullName ?? "—"}</td>
                                  <td className="max-w-[8rem] px-2 py-2 text-[11px] text-slate-500">{h.note ?? "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="md:hidden">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800"
                >
                  {t("ops.inventory.stock.filtersToggle")}
                  <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div
                className={`rounded-2xl border border-luxury-navy-rich/10 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm ${
                  filtersOpen ? "mt-3" : "hidden md:mt-0 md:block"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-slate-900 md:text-sm">{t("ops.inventory.stock.filtersTitle")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterQ("");
                      setDebouncedQ("");
                      setFilterInventoryCategory("");
                      setStockLocationId("");
                      setStockTierFilter("all");
                    }}
                    className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-luxury-navy-rich hover:bg-slate-50 md:inline-flex"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t("ops.inventory.stock.resetShort")}
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                  <label className="md:col-span-2 lg:col-span-2">
                    <span className={labelClass}>{t("ops.inventory.stock.search")}</span>
                    <input
                      type="search"
                      value={filterQ}
                      onChange={(e) => setFilterQ(e.target.value)}
                      className={inputClass}
                      placeholder={t("ops.inventory.stock.searchPlaceholder")}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.stock.location")}</span>
                    <select
                      value={stockLocationId}
                      onChange={(e) => setStockLocationId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">{t("ops.inventory.filter.allLocations")}</option>
                      <option value="__none__">{t("ops.inventory.filter.noLocation")}</option>
                      {inventoryLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.stock.category")}</span>
                    <select
                      value={filterInventoryCategory}
                      onChange={(e) => setFilterInventoryCategory(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">{t("ops.inventory.stock.tierAll")}</option>
                      {INVENTORY_FILTER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {translateInventoryCategory(t, c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>{t("ops.inventory.stock.stockState")}</span>
                    <select
                      value={stockTierFilter}
                      onChange={(e) => setStockTierFilter(e.target.value as StockFilterTier)}
                      className={inputClass}
                    >
                      <option value="all">{t("ops.inventory.stock.tierAll")}</option>
                      <option value="short">{t("ops.inventory.stock.tierShort")}</option>
                      <option value="low">{t("ops.inventory.stock.tierLow")}</option>
                      <option value="zero">{t("ops.inventory.stock.tierZero")}</option>
                    </select>
                  </label>
                  <div className="flex items-end md:col-span-2 lg:col-span-5 md:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterQ("");
                        setDebouncedQ("");
                        setFilterInventoryCategory("");
                        setStockLocationId("");
                        setStockTierFilter("all");
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-black text-luxury-navy-rich"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      {t("ops.inventory.stock.resetFiltersFull")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[min(55vh,520px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-[14px] leading-tight">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thProduct")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thCategory")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thLocation")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thCurrentQty")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thMinimum")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thState")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thUpdatedAt")}</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">{t("ops.inventory.stock.thActions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {stockRows.map((row) => {
                        const sm = inventoryStockPresentation(row.status, t);
                        const qtyDisplay =
                          row.currentQuantity === null || Number.isNaN(row.currentQuantity) ? "—" : row.currentQuantity;
                        return (
                          <tr
                            key={row.id}
                            className={`min-h-[58px] transition hover:brightness-[0.99] ${sm.row}`}
                            style={{ height: "58px" }}
                          >
                            <td className="px-3 py-2 align-middle font-bold text-slate-900">{row.name}</td>
                            <td className="px-3 py-2 align-middle text-[13px] text-slate-600">{translateInventoryCategory(t, row.category)}</td>
                            <td className="px-3 py-2 align-middle text-[13px] text-slate-700">{row.location}</td>
                            <td className="px-3 py-2 align-middle font-black tabular-nums text-lg text-slate-950">
                              {qtyDisplay}
                            </td>
                            <td className="px-3 py-2 align-middle tabular-nums text-[13px] text-slate-700">
                              {row.minimumQuantity}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${sm.badge}`}>
                                {sm.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-middle text-[12px] text-slate-600">
                              <span className="block">{formatDateTime(row.lastCountedAt, bcp47)}</span>
                              <span className="text-slate-400">{row.countedBy?.fullName ?? ""}</span>
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-black text-luxury-navy-rich underline"
                                  onClick={() => void openInventoryMovementModal(row.id)}
                                >
                                  {t("ops.inventory.stock.actionMovement")}
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-bold text-slate-600 underline"
                                  onClick={() => {
                                    const v = window.prompt(t("ops.inventory.stock.promptMin"), String(row.minimumQuantity));
                                    if (v === null) return;
                                    const n = Math.max(0, parseFloat(v));
                                    if (!Number.isFinite(n)) return;
                                    void (async () => {
                                      const res = await fetch(
                                        `/api/inventory/count-products/${encodeURIComponent(row.id)}`,
                                        {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          credentials: "same-origin",
                                          body: JSON.stringify({ minimumQuantity: n }),
                                        },
                                      );
                                      if (res.ok) {
                                        await Promise.all([loadStats(), loadStock()]);
                                      }
                                    })();
                                  }}
                                >
                                  {t("ops.inventory.stock.actionMin")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {stockRows.map((row) => {
                  const sm = inventoryStockPresentation(row.status, t);
                  const qtyDisplay =
                    row.currentQuantity === null || Number.isNaN(row.currentQuantity) ? "—" : row.currentQuantity;
                  return (
                    <div key={row.id} className={`app-panel space-y-2 p-4 ${sm.row}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-slate-950">{row.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${sm.badge}`}>
                          {sm.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {translateInventoryCategory(t, row.category)} · {row.location}
                      </p>
                      <p className="text-sm font-bold">
                        {t("ops.inventory.stock.mobileQty")} <span className="text-lg font-black tabular-nums">{qtyDisplay}</span>{" "}
                        <span className="font-semibold text-slate-500">{t("ops.inventory.stock.mobileMinSuffix", { min: row.minimumQuantity })}</span>
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(row.lastCountedAt, bcp47)}</p>
                      <button
                        type="button"
                        className="text-xs font-black text-luxury-navy-rich underline"
                        onClick={() => void openInventoryMovementModal(row.id)}
                      >
                        {t("ops.inventory.stock.actionMovement")}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="app-panel p-5">
                  <h3 className="text-sm font-black text-slate-900">{t("ops.inventory.pie.title")}</h3>
                  <div className="mt-4">
                    <InventoryPie
                      ok={stats?.pieOk ?? 0}
                      low={stats?.lowStockCount ?? 0}
                      shortage={stats?.shortageCount ?? 0}
                      t={t}
                    />
                  </div>
                </div>
                <div className="app-panel p-5">
                  <h3 className="text-sm font-black text-slate-900">{t("ops.inventory.recentToday.title")}</h3>
                  <div className="mt-4 hidden max-h-64 overflow-auto md:block">
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-2 py-2 font-bold">{t("ops.inventory.recentToday.thTime")}</th>
                          <th className="px-2 py-2 font-bold">{t("ops.inventory.recentToday.thProduct")}</th>
                          <th className="px-2 py-2 font-bold">{t("ops.inventory.recentToday.thAction")}</th>
                          <th className="px-2 py-2 font-bold">{t("ops.inventory.recentToday.thQuantity")}</th>
                          <th className="px-2 py-2 font-bold">{t("ops.inventory.recentToday.thUser")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {movements.slice(0, 12).map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-2 py-2 tabular-nums">{formatTime(m.createdAt, bcp47)}</td>
                            <td className="px-2 py-2 font-bold">{m.product.name}</td>
                            <td className="px-2 py-2">{movementActionLabel(m.type, t)}</td>
                            <td className="px-2 py-2 font-bold tabular-nums">{m.quantity}</td>
                            <td className="px-2 py-2 text-slate-600">{m.createdBy?.fullName ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 space-y-2 md:hidden">
                    {movements.slice(0, 8).map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
                        <span className="font-bold text-slate-900">{m.product.name}</span> ·{" "}
                        {movementActionLabel(m.type, t)} · {m.quantity} · {formatTime(m.createdAt, bcp47)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {addInventoryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-inv-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddInventoryOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir="rtl">
            <h3 id="add-inv-title" className="text-lg font-black text-slate-900">
              {t("ops.inventory.count.modalTitle")}
            </h3>
            <div className="mt-4 grid gap-3">
              <label>
                <span className={labelClass}>{t("ops.inventory.count.fieldItemName")}</span>
                <input
                  value={newCountProduct.name}
                  onChange={(e) => setNewCountProduct((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass}
                  placeholder={t("ops.inventory.count.fieldItemNamePlaceholder")}
                />
              </label>
              <label>
                <span className={labelClass}>{t("ops.inventory.count.fieldLocationRequired")}</span>
                <select
                  value={newCountProduct.locationId}
                  onChange={(e) => setNewCountProduct((p) => ({ ...p, locationId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">{t("ops.inventory.count.fieldChooseLocation")}</option>
                  {inventoryLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>{t("ops.inventory.count.fieldCategory")}</span>
                <select
                  value={newCountProduct.category}
                  onChange={(e) => setNewCountProduct((p) => ({ ...p, category: e.target.value }))}
                  className={inputClass}
                >
                  {INVENTORY_FILTER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {translateInventoryCategory(t, c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>{t("ops.inventory.count.fieldUnit")}</span>
                <input
                  value={newCountProduct.unit}
                  onChange={(e) => setNewCountProduct((p) => ({ ...p, unit: e.target.value }))}
                  className={inputClass}
                  placeholder={t("ops.inventory.count.fieldUnitPlaceholder")}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
                onClick={() => setAddInventoryOpen(false)}
              >
                {t("ops.inventory.count.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-luxury-gold px-5 py-2.5 text-sm font-black text-luxury-charcoal hover:bg-luxury-gold-hover disabled:opacity-50"
                onClick={() => void createCountProduct()}
              >
                {t("ops.inventory.count.saveBtn")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
