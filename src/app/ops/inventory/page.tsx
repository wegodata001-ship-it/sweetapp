"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  Box,
  ChevronDown,
  Clock,
  Package,
  Search,
  TrendingUp,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INVENTORY_MOVEMENT_KEYS,
  INVENTORY_MOVEMENT_LABELS,
  type InventoryMovementKey,
} from "@/lib/inventory/movement";

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
  unit: string | null;
  previousQuantity: number;
  lastCountedAt: string | null;
};

type ManagedInventoryProductRow = {
  id: string;
  name: string;
  location: string;
  category: string;
  minimumQuantity: number;
  unit: string | null;
  countsCount: number;
  createdAt: string;
};

type InventoryCountHistoryRow = {
  id: string;
  countDate: string;
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

const TABS = [
  { id: "monthly", label: "ספירה חדשה" },
  { id: "history", label: "היסטוריית ספירות" },
  { id: "products", label: "מוצרי ספירה" },
  { id: "daily", label: "תנועות יומיות" },
  { id: "stock", label: "מצב מלאי נוכחי" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function countDiffMeta(diff: number) {
  if (diff < 0) {
    return {
      label: "חוסר",
      diffStyle: { color: "#dc2626" } as CSSProperties,
      badgeClass: "font-black",
      badgeStyle: { backgroundColor: "rgba(220, 38, 38, 0.12)", color: "#dc2626" } as CSSProperties,
    };
  }
  if (diff > 0) {
    return {
      label: "תוספת",
      diffStyle: { color: "#16a34a" } as CSSProperties,
      badgeClass: "font-black",
      badgeStyle: { backgroundColor: "rgba(22, 163, 74, 0.12)", color: "#16a34a" } as CSSProperties,
    };
  }
  return {
    label: "ללא שינוי",
    diffStyle: { color: "#64748b" } as CSSProperties,
    badgeClass: "font-bold",
    badgeStyle: { backgroundColor: "rgba(100, 116, 139, 0.14)", color: "#64748b" } as CSSProperties,
  };
}

const INVENTORY_FILTER_CATEGORIES = ["חומרי גלם", "אריזות", "קירור", "מדבקות", "כללי", "מיקום"] as const;

function inventoryStockPresentation(status: InventoryStockRow["status"]) {
  switch (status) {
    case "חסר":
      return {
        label: "חסר",
        row: "bg-rose-50/75",
        badge: "bg-rose-100 text-rose-900",
      };
    case "נמוך":
      return {
        label: "נמוך",
        row: "bg-amber-50/55",
        badge: "bg-amber-100 text-amber-950",
      };
    default:
      return {
        label: "תקין",
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

function movementActionLabel(type: string) {
  return INVENTORY_MOVEMENT_LABELS[type as InventoryMovementKey] ?? type;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", {
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

function InventoryPie({ ok, low, shortage }: { ok: number; low: number; shortage: number }) {
  const total = ok + low + shortage;
  if (total === 0) {
    return <p className="py-8 text-center text-sm font-semibold text-slate-500">אין מוצרים — הוסיפו מוצרים במערכת</p>;
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
        aria-label="תרשים מצב מלאי"
      />
      <ul className="space-y-2 text-sm font-bold text-slate-700">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
          תקין: {ok}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden />
          במינימום: {low}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" aria-hidden />
          בחוסר: {shortage}
        </li>
      </ul>
    </div>
  );
}

export default function InventoryPage() {
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
  const [newCountProduct, setNewCountProduct] = useState({ name: "", location: "", unit: "" });
  const [addInventoryOpen, setAddInventoryOpen] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyProductId, setHistoryProductId] = useState("");
  const [historyOnlyShortage, setHistoryOnlyShortage] = useState(false);
  const [historyOnlySurplus, setHistoryOnlySurplus] = useState(false);

  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productQuery, setProductQuery] = useState("");
  const [productPick, setProductPick] = useState<MovementProductPick | null>(null);
  const [suggestions, setSuggestions] = useState<MovementProductPick[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);
  const [movType, setMovType] = useState<InventoryMovementKey>("STOCK_IN");
  const [movQty, setMovQty] = useState("1");
  const [movUserId, setMovUserId] = useState("");
  const [movNote, setMovNote] = useState("");

  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [filterInventoryCategory, setFilterInventoryCategory] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const loadCountProducts = useCallback(async () => {
    const res = await fetch("/api/inventory/monthly-count", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryCountProductRow[] };
    setCountProducts(j.data ?? []);
  }, []);

  const loadManagedCountProducts = useCallback(async () => {
    const res = await fetch("/api/inventory/count-products", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ManagedInventoryProductRow[] };
    setManagedCountProducts(j.data ?? []);
  }, []);

  const loadCountHistory = useCallback(async () => {
    const params = new URLSearchParams();
    if (historyDateFrom) params.set("dateFrom", historyDateFrom);
    if (historyDateTo) params.set("dateTo", historyDateTo);
    if (historyProductId) params.set("productId", historyProductId);
    if (historyOnlyShortage) params.set("onlyShortage", "1");
    if (historyOnlySurplus) params.set("onlySurplus", "1");
    const res = await fetch(`/api/inventory/count-history?${params.toString()}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryCountHistoryRow[] };
    setHistoryRows(j.data ?? []);
  }, [historyDateFrom, historyDateTo, historyOnlyShortage, historyOnlySurplus, historyProductId]);

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
    if (onlyShortage) params.set("onlyShortage", "1");
    if (onlyBelowMin) params.set("onlyBelowMin", "1");
    if (filterInventoryCategory) params.set("category", filterInventoryCategory);
    const res = await fetch(`/api/inventory/stock?${params.toString()}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: InventoryStockRow[] };
    setStockRows(j.data ?? []);
  }, [debouncedQ, onlyShortage, onlyBelowMin, filterInventoryCategory]);

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
        loadCountProducts(),
        loadManagedCountProducts(),
        loadCountHistory(),
        loadMovements(movementDate),
        loadStock(),
      ]);
    } catch {
      setLoadError("טעינה נכשלה");
    }
  }, [loadCountHistory, loadCountProducts, loadManagedCountProducts, loadMeta, loadMovements, loadStats, loadStock, movementDate]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshAll();
    });
  }, [refreshAll]);

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
        setNotice("הזינו ספירה בפועל לפחות למוצר אחד.");
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
        setNotice(j.error ?? "שמירה נכשלה");
        setBusy(false);
        return;
      }
      setNotice(`נשמרה ספירת מלאי (${lines.length} שורות).`);
      setActualById({});
      setNotesById({});
      await Promise.all([loadStats(), loadCountProducts(), loadCountHistory()]);
    } catch {
      setNotice("שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const createCountProduct = async () => {
    if (!newCountProduct.name.trim()) {
      setNotice("חסר שם פריט מלאי.");
      return;
    }
    if (!newCountProduct.location.trim()) {
      setNotice("חובה לציין מיקום.");
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
          location: newCountProduct.location.trim(),
          unit: newCountProduct.unit.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? "יצירת פריט נכשלה");
        return;
      }
      setNewCountProduct({ name: "", location: "", unit: "" });
      setAddInventoryOpen(false);
      setNotice("פריט ספירה נוסף למערכת.");
      await Promise.all([loadCountProducts(), loadManagedCountProducts(), loadStats()]);
    } catch {
      setNotice("יצירת פריט נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const submitMovement = async () => {
    if (!productPick) {
      setNotice("בחרו מוצר מהרשימה.");
      return;
    }
    const qn = Number(movQty);
    if (!Number.isFinite(qn)) {
      setNotice("כמות לא תקינה");
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
        setNotice(j.error ?? "שמירה נכשלה");
        setBusy(false);
        return;
      }
      setNotice("תנועת מלאי נשמרה.");
      setMovNote("");
      setMovQty("1");
      setProductPick(null);
      setProductQuery("");
      await Promise.all([loadStats(), loadCountProducts(), loadMovements(movementDate), loadStock()]);
    } catch {
      setNotice("שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";
  const labelClass = "block text-xs font-bold text-slate-600";

  return (
    <div className="mx-auto max-w-7xl space-y-[14px] pb-6" dir="rtl">
      <section className="app-panel mb-[14px] px-5 py-6 md:px-7 md:py-7">
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-luxury-navy-rich opacity-80">
          <Package className="h-4 w-4 shrink-0 text-luxury-gold" aria-hidden />
          מלאי ותנועות
        </p>
        <h1 className="erp-page-title mt-2 text-slate-950">ניהול מלאי</h1>
        <p className="mt-1 max-w-3xl text-[15px] leading-snug text-slate-600 opacity-80">
          מערכת ספירת מלאי ותנועות — בקרה מלאה על המלאי שלך.
        </p>
        {loadError ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {loadError}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            {notice}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-luxury-navy-rich/15 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">סה״כ פריטים</p>
            <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
              <Box className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-luxury-navy-rich md:text-3xl">
            {stats?.totalProducts ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">פריטים במערכת</p>
        </div>
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-rose-200/80 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">פריטים בחוסר</p>
            <span className="rounded-xl bg-rose-50 p-2 text-rose-600">
              <ArrowDownRight className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-rose-700 md:text-3xl">
            {stats?.shortageCount ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">פריטים בחוסר</p>
        </div>
        <div className="app-panel flex min-h-[120px] flex-col justify-between border-amber-200/80 p-4 shadow-luxury-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">פריטים במינימום</p>
            <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-amber-800 md:text-3xl">
            {stats?.lowStockCount ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">כמעט נגמרו</p>
        </div>
        <div className="app-panel col-span-2 flex min-h-[120px] flex-col justify-between border-emerald-200/80 p-4 shadow-luxury-sm md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">תנועות היום</p>
            <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-emerald-800 md:text-3xl">
            {stats?.todayMovements ?? "—"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">התאמות שנרשמו היום</p>
        </div>
      </div>

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

        <div className="p-4 md:p-6">
          {tab === "monthly" ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 md:flex-row md:flex-wrap md:items-end">
                <label className="min-w-[10rem] flex-1">
                  <span className={labelClass}>תאריך ספירה</span>
                  <input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className={inputClass} />
                </label>
                <p className="flex flex-1 items-center gap-2 text-xs font-semibold text-slate-500">
                  <WarehouseIcon className="h-4 w-4" aria-hidden />
                  הספירה משווה אוטומטית מול הספירה האחרונה של כל פריט.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAddInventoryOpen(true)}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-luxury-navy-rich shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  + הוסף פריט מלאי
                </button>
                <button
                  type="button"
                  disabled={busy || countProducts.length === 0}
                  onClick={() => void saveMonthly()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:opacity-50"
                >
                  שמור ספירת מלאי
                </button>
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
                      פריט מלאי חדש
                    </h3>
                    <div className="mt-4 grid gap-3">
                      <label>
                        <span className={labelClass}>שם פריט</span>
                        <input
                          value={newCountProduct.name}
                          onChange={(e) => setNewCountProduct((p) => ({ ...p, name: e.target.value }))}
                          className={inputClass}
                          placeholder="למשל קמח לבן"
                        />
                      </label>
                      <label>
                        <span className={labelClass}>מיקום</span>
                        <input
                          value={newCountProduct.location}
                          onChange={(e) => setNewCountProduct((p) => ({ ...p, location: e.target.value }))}
                          className={inputClass}
                          placeholder="מדף א / מקרר…"
                        />
                      </label>
                      <label>
                        <span className={labelClass}>יחידה</span>
                        <input
                          value={newCountProduct.unit}
                          onChange={(e) => setNewCountProduct((p) => ({ ...p, unit: e.target.value }))}
                          className={inputClass}
                          placeholder="ק״ג, יח׳…"
                        />
                      </label>
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
                        onClick={() => setAddInventoryOpen(false)}
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl bg-luxury-gold px-5 py-2.5 text-sm font-black text-luxury-charcoal hover:bg-luxury-gold-hover disabled:opacity-50"
                        onClick={() => void createCountProduct()}
                      >
                        שמירה
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {countProducts.length === 0 ? (
                <p className="text-sm font-semibold text-slate-600">
                  אין מוצרי ספירה קבועים. עברו לטאב{" "}
                  <button type="button" onClick={() => setTab("products")} className="font-black text-luxury-navy-rich underline">
                    מוצרי ספירה
                  </button>{" "}
                  והוסיפו קמח, סוכר, שמנת, מגשים או כל פריט פנימי אחר.
                </p>
              ) : (
                <>
                  <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                    <div className="max-h-[min(70vh,720px)] overflow-auto">
                      <table className="inventory-count-table min-w-full divide-y divide-slate-200 text-right text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                          <tr>
                            <th className="px-3 py-3 font-bold text-slate-700">פריט</th>
                            <th className="px-3 py-3 font-bold text-slate-700">מיקום</th>
                            <th className="px-3 py-3 font-bold text-slate-700">קודם</th>
                            <th className="px-3 py-3 font-bold text-slate-700">חדש</th>
                            <th className="px-3 py-3 font-bold text-slate-700">שינוי</th>
                            <th className="px-3 py-3 font-bold text-slate-700">סטטוס</th>
                            <th className="px-3 py-3 font-bold text-slate-700">הערה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
                          {monthlyRows.map((row) => {
                            const dm = row.diff === null ? null : countDiffMeta(row.diff);
                            const countInputStyle: CSSProperties = {
                              height: 40,
                              width: 88,
                              fontSize: 14,
                            };
                            return (
                              <tr key={row.id} className="min-h-[58px] transition hover:bg-slate-50/80">
                                <td className="max-w-[14rem] px-3 py-2 align-middle font-bold text-slate-900">
                                  {row.name}
                                  {row.unit ? (
                                    <span className="block text-[11px] font-semibold text-slate-500">{row.unit}</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 align-middle text-xs font-semibold text-slate-600">{row.location}</td>
                                <td className="px-3 py-2 align-middle tabular-nums font-semibold text-slate-800">
                                  {row.previousQuantity}
                                </td>
                                <td className="px-3 py-2 align-middle">
                  <input
                    type="number"
                    inputMode="decimal"
                                    step="0.01"
                                    style={countInputStyle}
                    value={row.raw}
                    onChange={(e) =>
                                      setActualById((p) => ({ ...p, [row.id]: e.target.value }))
                    }
                                    className="rounded-lg border border-slate-300 px-2 text-left font-bold tabular-nums outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
                                    placeholder="ספירה"
                                    id={`actual-${row.id}`}
                  />
                </td>
                                <td className="px-3 py-2 align-middle">
                  {row.diff === null ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    <span className="font-bold tabular-nums" style={dm?.diffStyle}>
                                      {row.diff > 0 ? "+" : ""}
                                      {row.diff}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  {dm ? (
                    <span
                                      className={`inline-flex rounded-full px-2.5 py-1 text-xs ${dm.badgeClass}`}
                                      style={dm.badgeStyle}
                                    >
                                      {dm.label}
                    </span>
                                  ) : (
                                    "—"
                  )}
                </td>
                                <td className="min-w-[7rem] px-3 py-2 align-middle">
                                  <input
                                    type="text"
                                    value={notesById[row.id] ?? ""}
                                    onChange={(e) =>
                                      setNotesById((p) => ({ ...p, [row.id]: e.target.value }))
                                    }
                                    className="h-10 max-w-[12rem] rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-luxury-gold"
                                    placeholder="למשל נשפך…"
                                  />
                                </td>
              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {monthlyRows.map((row) => {
                      const dm = row.diff === null ? null : countDiffMeta(row.diff);
                      return (
                        <div
                          key={row.id}
                          className="app-panel-muted space-y-3 p-4 shadow-none"
                        >
                          <p className="font-black text-slate-950">{row.name}</p>
                          <p className="text-xs text-slate-500">
                            מיקום: {row.location ?? "—"} · קודם: {row.previousQuantity} {row.unit ?? ""}
                          </p>
                          <label className="block text-xs font-bold text-slate-600">כמות חדשה</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            style={{ height: 40, width: 88, fontSize: 14 }}
                            value={row.raw}
                            onChange={(e) =>
                              setActualById((p) => ({ ...p, [row.id]: e.target.value }))
                            }
                            className="rounded-lg border border-slate-300 px-2 text-left font-bold tabular-nums outline-none focus:border-luxury-gold"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            {dm ? (
                              <>
                                <span className="font-bold tabular-nums" style={dm.diffStyle}>
                                  שינוי: {row.diff! > 0 ? "+" : ""}
                                  {row.diff}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${dm.badgeClass}`}
                                  style={dm.badgeStyle}
                                >
                                  {dm.label}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <input
                            type="text"
                            value={notesById[row.id] ?? ""}
                            onChange={(e) =>
                              setNotesById((p) => ({ ...p, [row.id]: e.target.value }))
                            }
                            className={inputClass}
                            placeholder="הערה…"
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {tab === "history" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <label>
                    <span className={labelClass}>מתאריך</span>
                    <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} className={inputClass} />
                  </label>
                  <label>
                    <span className={labelClass}>עד תאריך</span>
                    <input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} className={inputClass} />
                  </label>
                  <label>
                    <span className={labelClass}>לפי מוצר</span>
                    <select value={historyProductId} onChange={(e) => setHistoryProductId(e.target.value)} className={inputClass}>
                      <option value="">כל המוצרים</option>
                      {countProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-black text-rose-800">
                      <input
                        type="checkbox"
                        checked={historyOnlyShortage}
                        onChange={(e) => {
                          setHistoryOnlyShortage(e.target.checked);
                          if (e.target.checked) setHistoryOnlySurplus(false);
                        }}
                      />
                      רק חוסרים
                    </label>
                    <label className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-800">
                      <input
                        type="checkbox"
                        checked={historyOnlySurplus}
                        onChange={(e) => {
                          setHistoryOnlySurplus(e.target.checked);
                          if (e.target.checked) setHistoryOnlyShortage(false);
                        }}
                      />
                      רק עודפים
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadCountHistory()}
                    className="self-end rounded-xl bg-luxury-navy-rich px-4 py-3 text-sm font-black text-white hover:bg-luxury-charcoal"
                  >
                    סינון היסטוריה
                  </button>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <div className="max-h-[min(70vh,680px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-4 py-3.5 font-bold text-slate-700">תאריך</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">פריט</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">קודם</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">חדש</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">שינוי</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">עובד</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">הערה</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {historyRows.map((row) => {
                        const dm = countDiffMeta(row.difference);
                        return (
                          <tr key={row.id} className="transition hover:bg-slate-50/80">
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{formatDateTime(row.countDate)}</td>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {row.product.name}
                              <span className="block text-[11px] font-semibold text-slate-500">{row.product.location}</span>
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{row.previousQuantity}</td>
                            <td className="px-4 py-3 tabular-nums font-black text-slate-900">{row.currentQuantity}</td>
                            <td className="px-4 py-3">
                              <span className="font-bold tabular-nums" style={dm.diffStyle}>
                                {row.difference > 0 ? "+" : ""}
                                {row.difference}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{row.countedBy?.fullName ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">{row.note ?? "—"}</td>
                          </tr>
                        );
                      })}
          </tbody>
        </table>
      </div>
              </div>
              <div className="space-y-3 md:hidden">
                {historyRows.map((row) => {
                  const dm = countDiffMeta(row.difference);
                  return (
                    <div key={row.id} className="app-panel-muted space-y-2 p-4 shadow-none">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-slate-950">{row.product.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${dm.badgeClass}`}
                          style={dm.badgeStyle}
                        >
                          {dm.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{formatDateTime(row.countDate)}</p>
                      <p className="text-sm font-bold">
                        קודם {row.previousQuantity} · חדש {row.currentQuantity} ·{" "}
                        <span className="font-bold tabular-nums" style={dm.diffStyle}>
                          {row.difference > 0 ? "+" : ""}
                          {row.difference}
                        </span>
                      </p>
                      {row.note ? <p className="text-xs text-slate-600">{row.note}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === "products" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-sm font-black text-slate-900">הוספת פריט מלאי</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <label>
                    <span className={labelClass}>שם פריט *</span>
                    <input
                      value={newCountProduct.name}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, name: e.target.value }))}
                      className={inputClass}
                      placeholder="קמח לבן"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>מיקום *</span>
                    <input
                      value={newCountProduct.location}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, location: e.target.value }))}
                      className={inputClass}
                      placeholder="מדף א / מקרר…"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>יחידה</span>
                    <input
                      value={newCountProduct.unit}
                      onChange={(e) => setNewCountProduct((p) => ({ ...p, unit: e.target.value }))}
                      className={inputClass}
                      placeholder="ק״ג / יח׳"
                    />
                  </label>
      <button
        type="button"
                    disabled={busy}
                    onClick={() => void createCountProduct()}
                    className="self-end rounded-xl bg-luxury-gold px-4 py-3 text-sm font-black text-luxury-charcoal hover:bg-luxury-gold-hover disabled:opacity-50"
      >
                    הוסף פריט
      </button>
    </div>
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3.5 font-bold text-slate-700">פריט</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">קטגוריה</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">מיקום</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">יחידה</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">מינימום</th>
                      <th className="px-4 py-3.5 font-bold text-slate-700">מספר ספירות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {managedCountProducts.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{row.category}</td>
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
                      {row.category} · {row.location} · {row.unit ?? "—"}
                    </p>
                    <p className="text-xs font-bold text-slate-700">
                      מינ׳ {row.minimumQuantity} · ספירות: {row.countsCount}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "daily" ? (
            <div className="space-y-6">
              <div className="app-panel-muted space-y-4 p-4 md:p-5">
                <h3 className="text-sm font-black text-slate-900">הוספת תנועה</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className="md:col-span-2 lg:col-span-1">
                    <span className={labelClass}>תאריך תצוגה (טבלה)</span>
                    <input
                      type="date"
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="relative md:col-span-2" ref={suggestRef}>
                    <span className={labelClass}>בחירת פריט</span>
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
                        placeholder="הקלידו שם מוצר…"
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
                              <span className="text-xs text-slate-500">מלאי: {s.currentStock}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label>
                    <span className={labelClass}>סוג תנועה</span>
                    <select
                      value={movType}
                      onChange={(e) => setMovType(e.target.value as InventoryMovementKey)}
                      className={inputClass}
                    >
                      {INVENTORY_MOVEMENT_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {INVENTORY_MOVEMENT_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>כמות {movType === "STOCK_FIX" ? "(חיובי/שלילי לתיקון)" : ""}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={movQty}
                      onChange={(e) => setMovQty(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>עובד שביצע</span>
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
                    <span className={labelClass}>הערה</span>
                    <input
                      type="text"
                      value={movNote}
                      onChange={(e) => setMovNote(e.target.value)}
                      className={inputClass}
                      placeholder="טקסט חופשי…"
                    />
                  </label>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  <Clock className="me-1 inline h-3.5 w-3.5" aria-hidden />
                  תאריך ושעת שמירה יירשמו אוטומטית במסד.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitMovement()}
                  className="inline-flex items-center justify-center rounded-xl bg-luxury-navy-rich px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-luxury-charcoal disabled:opacity-50"
                >
                  שמירת תנועה
                </button>
              </div>

              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[min(60vh,560px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-4 py-3.5 font-bold text-slate-700">שעה</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">פריט</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">פעולה</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">כמות</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">עובד</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">הערה</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {movements.map((m) => (
                        <tr key={m.id} className={`${movementRowClass(m.type)} transition hover:bg-white/60`}>
                          <td className="px-4 py-3 tabular-nums font-semibold text-slate-700">
                            {formatTime(m.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900">{m.product.name}</td>
                          <td className="px-4 py-3 text-xs font-black text-slate-800">
                            {movementActionLabel(m.type)}
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
                  <p className="text-sm text-slate-500">אין תנועות בתאריך זה.</p>
                ) : (
                  movements.map((m) => (
                    <div
                      key={m.id}
                      className={`app-panel space-y-2 p-4 ${movementRowClass(m.type)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-slate-900">{m.product.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{formatTime(m.createdAt)}</span>
                      </div>
                      <p className="text-xs font-black text-luxury-navy-rich">{movementActionLabel(m.type)}</p>
                      <p className="text-sm font-bold">כמות: {m.quantity}</p>
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
                          תנועת מלאי (ספירות)
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
                        סגור
                      </button>
                    </div>
                    <div className="min-h-[200px] overflow-auto p-3 text-[13px]">
                      {stockMovementLoading ? (
                        <p className="py-8 text-center text-sm font-semibold text-slate-500">טוען…</p>
                      ) : stockMovementRows.length === 0 ? (
                        <p className="py-8 text-center text-sm font-semibold text-slate-500">אין ספירות לפריט זה.</p>
                      ) : (
                        <table className="w-full border-collapse text-right text-[13px]">
                          <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold text-slate-600">
                            <tr>
                              <th className="px-2 py-2">תאריך</th>
                              <th className="px-2 py-2">קודם</th>
                              <th className="px-2 py-2">חדש</th>
                              <th className="px-2 py-2">הפרש</th>
                              <th className="px-2 py-2">עובד</th>
                              <th className="px-2 py-2">הערה</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {stockMovementRows.map((h) => {
                              const dm = countDiffMeta(h.difference);
                              return (
                                <tr key={h.id} className="align-top">
                                  <td className="px-2 py-2 tabular-nums text-slate-700">{formatDateTime(h.countDate)}</td>
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
                  מסננים
                  <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div
                className={`grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 ${filtersOpen ? "mt-3" : "hidden md:grid"}`}
              >
                <label className="lg:col-span-2">
                  <span className={labelClass}>חיפוש מוצר</span>
                  <input
                    type="search"
                    value={filterQ}
                    onChange={(e) => setFilterQ(e.target.value)}
                    className={inputClass}
                    placeholder="שם…"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={onlyShortage}
                    onChange={(e) => setOnlyShortage(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-bold text-slate-800">רק חוסרים</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={onlyBelowMin}
                    onChange={(e) => setOnlyBelowMin(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-bold text-slate-800">מתחת או במינימום</span>
                </label>
                <label>
                  <span className={labelClass}>קטגוריה</span>
                  <select
                    value={filterInventoryCategory}
                    onChange={(e) => setFilterInventoryCategory(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">הכל</option>
                    {INVENTORY_FILTER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[min(55vh,520px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-[14px] leading-tight">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-3 py-2.5 font-bold text-slate-700">מוצר</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">קטגוריה</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">מיקום</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">כמות נוכחית</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">מינימום</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">מצב</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">עודכן לאחרונה</th>
                        <th className="px-3 py-2.5 font-bold text-slate-700">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {stockRows.map((row) => {
                        const sm = inventoryStockPresentation(row.status);
                        const qtyDisplay =
                          row.currentQuantity === null || Number.isNaN(row.currentQuantity) ? "—" : row.currentQuantity;
                        return (
                          <tr
                            key={row.id}
                            className={`min-h-[58px] transition hover:brightness-[0.99] ${sm.row}`}
                            style={{ height: "58px" }}
                          >
                            <td className="px-3 py-2 align-middle font-bold text-slate-900">{row.name}</td>
                            <td className="px-3 py-2 align-middle text-[13px] text-slate-600">{row.category}</td>
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
                              <span className="block">{formatDateTime(row.lastCountedAt)}</span>
                              <span className="text-slate-400">{row.countedBy?.fullName ?? ""}</span>
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-black text-luxury-navy-rich underline"
                                  onClick={() => void openInventoryMovementModal(row.id)}
                                >
                                  תנועה
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-bold text-slate-600 underline"
                                  onClick={() => {
                                    const v = window.prompt("מינימום לפריט ספירה:", String(row.minimumQuantity));
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
                                  מינ׳
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
                  const sm = inventoryStockPresentation(row.status);
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
                        {row.category} · {row.location}
                      </p>
                      <p className="text-sm font-bold">
                        כמות: <span className="text-lg font-black tabular-nums">{qtyDisplay}</span>{" "}
                        <span className="font-semibold text-slate-500">/ מינ׳ {row.minimumQuantity}</span>
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(row.lastCountedAt)}</p>
                      <button
                        type="button"
                        className="text-xs font-black text-luxury-navy-rich underline"
                        onClick={() => void openInventoryMovementModal(row.id)}
                      >
                        תנועה
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="app-panel p-5">
                  <h3 className="text-sm font-black text-slate-900">התפלגות מצב מלאי</h3>
                  <div className="mt-4">
                    <InventoryPie
                      ok={stats?.pieOk ?? 0}
                      low={stats?.lowStockCount ?? 0}
                      shortage={stats?.shortageCount ?? 0}
                    />
                  </div>
                </div>
                <div className="app-panel p-5">
                  <h3 className="text-sm font-black text-slate-900">תנועות אחרונות (היום)</h3>
                  <div className="mt-4 hidden max-h-64 overflow-auto md:block">
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-2 py-2 font-bold">שעה</th>
                          <th className="px-2 py-2 font-bold">מוצר</th>
                          <th className="px-2 py-2 font-bold">פעולה</th>
                          <th className="px-2 py-2 font-bold">כמות</th>
                          <th className="px-2 py-2 font-bold">עובד</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {movements.slice(0, 12).map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-2 py-2 tabular-nums">{formatTime(m.createdAt)}</td>
                            <td className="px-2 py-2 font-bold">{m.product.name}</td>
                            <td className="px-2 py-2">{movementActionLabel(m.type)}</td>
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
                        {movementActionLabel(m.type)} · {m.quantity} · {formatTime(m.createdAt)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
