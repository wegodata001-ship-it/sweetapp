"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  Box,
  ChevronDown,
  Clock,
  Package,
  Pencil,
  Search,
  TrendingUp,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INVENTORY_MOVEMENT_KEYS,
  INVENTORY_MOVEMENT_LABELS,
  type InventoryMovementKey,
} from "@/lib/inventory/movement";

type ProductRow = {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  lastStockAt?: string | null;
  lastStockBy?: { id: string; fullName: string; email: string } | null;
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

const TABS = [
  { id: "monthly", label: "ספירה חודשית" },
  { id: "daily", label: "תנועות יומיות" },
  { id: "stock", label: "מצב מלאי נוכחי" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function countDiffMeta(diff: number) {
  if (diff < 0) return { label: "חסר", diffClass: "text-rose-700 font-black", badge: "bg-rose-100 text-rose-900" };
  if (diff > 0) return { label: "עודף", diffClass: "text-emerald-700 font-black", badge: "bg-emerald-100 text-emerald-800" };
  return { label: "תקין", diffClass: "text-emerald-600 font-bold", badge: "bg-emerald-50 text-emerald-800" };
}

function stockStatusMeta(p: Pick<ProductRow, "currentStock" | "minStock">) {
  if (p.currentStock <= 0) {
    return { label: "חסר", row: "bg-rose-50/50", badge: "bg-rose-100 text-rose-900" };
  }
  if (p.minStock > 0 && p.currentStock <= p.minStock) {
    return { label: "נמוך", row: "bg-amber-50/40", badge: "bg-amber-100 text-amber-950" };
  }
  return { label: "תקין", row: "", badge: "bg-emerald-100 text-emerald-900" };
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
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stockRows, setStockRows] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState("");
  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productQuery, setProductQuery] = useState("");
  const [productPick, setProductPick] = useState<ProductRow | null>(null);
  const [suggestions, setSuggestions] = useState<ProductRow[]>([]);
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
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterLastUser, setFilterLastUser] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/inventory", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ProductRow[] };
    setProducts(j.data ?? []);
  }, []);

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
    if (filterCategory) params.set("categoryId", filterCategory);
    if (filterSupplier) params.set("supplierId", filterSupplier);
    if (filterLastUser) params.set("lastUpdatedById", filterLastUser);
    const res = await fetch(`/api/inventory/stock?${params.toString()}`, { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ProductRow[] };
    setStockRows(j.data ?? []);
  }, [debouncedQ, onlyShortage, onlyBelowMin, filterCategory, filterSupplier, filterLastUser]);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      await Promise.all([loadStats(), loadMeta(), loadProducts(), loadMovements(movementDate), loadStock()]);
    } catch {
      setLoadError("טעינה נכשלה");
    }
  }, [loadMeta, loadMovements, loadProducts, loadStats, loadStock, movementDate]);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (meta?.users.length && movUserId === "") {
      setMovUserId(meta.users[0].id);
    }
  }, [meta, movUserId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filterQ), 320);
    return () => window.clearTimeout(t);
  }, [filterQ]);

  useEffect(() => {
    if (tab === "stock") void loadStock();
  }, [tab, loadStock]);

  useEffect(() => {
    void loadMovements(movementDate);
  }, [movementDate, loadMovements]);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const id = window.setTimeout(async () => {
      const res = await fetch(`/api/inventory/stock?q=${encodeURIComponent(q)}&limit=12`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { data?: ProductRow[] };
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
    return products.map((p) => {
      const raw = actualById[p.id] ?? "";
      const actual = raw === "" ? null : Number(raw);
      const diff = actual === null || Number.isNaN(actual) ? null : Math.trunc(actual) - p.currentStock;
      return { ...p, raw, actual, diff };
    });
  }, [products, actualById]);

  const saveMonthly = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const lines = monthlyRows
        .filter((r) => r.actual !== null && !Number.isNaN(r.actual))
        .map((r) => ({
          productId: r.id,
          actualQty: r.actual as number,
          notes: notesById[r.id]?.trim() || null,
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
          warehouseId: warehouseId || null,
          lines,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice(j.error ?? "שמירה נכשלה");
        setBusy(false);
        return;
      }
      setNotice(`נשמרה ספירה חודשית (${lines.length} שורות).`);
      setActualById({});
      setNotesById({});
      await Promise.all([loadStats(), loadProducts(), loadStock()]);
    } catch {
      setNotice("שמירה נכשלה");
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
      await Promise.all([loadStats(), loadProducts(), loadMovements(movementDate), loadStock()]);
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
    <div className="mx-auto max-w-7xl space-y-6 px-3 pb-10 sm:px-4" dir="rtl">
      <section className="app-panel p-5 md:p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-luxury-navy-rich">
          <Package className="h-4 w-4 shrink-0 text-luxury-gold" aria-hidden />
          מלאי ותנועות
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">ניהול מלאי</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="app-panel border-luxury-navy-rich/15 p-4 shadow-luxury-sm md:p-5">
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
        <div className="app-panel border-rose-200/80 p-4 shadow-luxury-sm md:p-5">
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
        <div className="app-panel border-amber-200/80 p-4 shadow-luxury-sm md:p-5">
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
        <div className="app-panel col-span-2 border-emerald-200/80 md:col-span-1 p-4 shadow-luxury-sm md:p-5">
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
                {meta && meta.warehouses.length > 0 ? (
                  <label className="min-w-[12rem] flex-1">
                    <span className={labelClass}>מחסן</span>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— ללא / כללי —</option>
                      {meta.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <WarehouseIcon className="h-4 w-4" aria-hidden />
                    אין מחסנים מוגדרים — ניתן להוסיף במסד (Warehouse).
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || products.length === 0}
                  onClick={() => void saveMonthly()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:opacity-50"
                >
                  שמור ספירה חודשית
                </button>
              </div>

              {products.length === 0 ? (
                <p className="text-sm font-semibold text-slate-600">
                  אין מוצרים. מוצרים נוצרים אוטומטית מרישום כספי או דרך{" "}
                  <Link href="/finance/register" className="font-black text-luxury-navy-rich underline">
                    רישום כספי
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                    <div className="max-h-[min(70vh,720px)] overflow-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                          <tr>
                            <th className="px-4 py-3.5 font-bold text-slate-700">פריט</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">כמות במערכת</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">ספירה בפועל</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">הפרש</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">סטטוס</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">הערות</th>
                            <th className="px-4 py-3.5 font-bold text-slate-700">פעולות</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {monthlyRows.map((row) => {
                            const dm = row.diff === null ? null : countDiffMeta(row.diff);
                            return (
                              <tr key={row.id} className="transition hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                                <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">
                                  {row.currentStock}
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={row.raw}
                                    onChange={(e) =>
                                      setActualById((p) => ({ ...p, [row.id]: e.target.value }))
                                    }
                                    className="w-28 rounded-xl border border-slate-300 px-2 py-2 text-left font-bold tabular-nums outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
                                    placeholder="ספירה"
                                    id={`actual-${row.id}`}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  {row.diff === null ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    <span className={dm?.diffClass}>
                                      {row.diff > 0 ? "+" : ""}
                                      {row.diff}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {dm ? (
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${dm.badge}`}>
                                      {dm.label}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    value={notesById[row.id] ?? ""}
                                    onChange={(e) =>
                                      setNotesById((p) => ({ ...p, [row.id]: e.target.value }))
                                    }
                                    className="w-full min-w-[8rem] rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold outline-none focus:border-luxury-gold"
                                    placeholder="הוסף הערה…"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    className="rounded-lg p-2 text-luxury-navy-rich hover:bg-luxury-gold/15"
                                    aria-label="עריכת שורה"
                                    onClick={() => document.getElementById(`actual-${row.id}`)?.focus()}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
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
                          <p className="text-xs text-slate-500">במערכת: {row.currentStock}</p>
                          <label className="block text-xs font-bold text-slate-600">ספירה בפועל</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={row.raw}
                            onChange={(e) =>
                              setActualById((p) => ({ ...p, [row.id]: e.target.value }))
                            }
                            className={inputClass}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            {dm ? (
                              <>
                                <span className={dm.diffClass}>
                                  הפרש: {row.diff! > 0 ? "+" : ""}
                                  {row.diff}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${dm.badge}`}>
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
                className={`grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 ${filtersOpen ? "mt-3" : "hidden md:grid"}`}
              >
                <label className="xl:col-span-2">
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
                  <span className="text-sm font-bold text-slate-800">רק מתחת למינימום</span>
                </label>
                <label>
                  <span className={labelClass}>קטגוריה</span>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">הכל</option>
                    {(meta?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>ספק</span>
                  <select
                    value={filterSupplier}
                    onChange={(e) => setFilterSupplier(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">הכל</option>
                    {(meta?.suppliers ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="md:col-span-2 lg:col-span-3 xl:col-span-2">
                  <span className={labelClass}>עובד אחרון שערך</span>
                  <select
                    value={filterLastUser}
                    onChange={(e) => setFilterLastUser(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">הכל</option>
                    {(meta?.users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[min(55vh,520px)] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                      <tr>
                        <th className="px-4 py-3.5 font-bold text-slate-700">מוצר</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">קטגוריה</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">כמות נוכחית</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">מינימום</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">מצב</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">עודכן לאחרונה</th>
                        <th className="px-4 py-3.5 font-bold text-slate-700">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {stockRows.map((row) => {
                        const sm = stockStatusMeta(row);
                        return (
                          <tr
                            key={row.id}
                            className={`h-14 transition hover:bg-slate-50/90 ${sm.row}`}
                          >
                            <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {row.category?.name ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-black tabular-nums text-slate-900">
                              {row.currentStock}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate-700">{row.minStock}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${sm.badge}`}>
                                {sm.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <span className="block">{formatDateTime(row.lastStockAt)}</span>
                              <span className="text-slate-400">{row.lastStockBy?.fullName ?? ""}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-black text-luxury-navy-rich underline"
                                  onClick={() => {
                                    setTab("daily");
                                    setProductPick(row);
                                    setProductQuery("");
                                  }}
                                >
                                  תנועה
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-bold text-slate-600 underline"
                                  onClick={() => {
                                    const v = window.prompt("מינימום מלאי לפריט:", String(row.minStock));
                                    if (v === null) return;
                                    const n = Math.max(0, parseInt(v, 10));
                                    if (!Number.isFinite(n)) return;
                                    void (async () => {
                                      const res = await fetch(`/api/inventory/products/${encodeURIComponent(row.id)}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "same-origin",
                                        body: JSON.stringify({ minStock: n }),
                                      });
                                      if (res.ok) {
                                        await Promise.all([loadStats(), loadStock(), loadProducts()]);
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
                  const sm = stockStatusMeta(row);
                  return (
                    <div key={row.id} className={`app-panel space-y-2 p-4 ${sm.row}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-slate-950">{row.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${sm.badge}`}>
                          {sm.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">קטגוריה: {row.category?.name ?? "—"}</p>
                      <p className="text-sm font-bold">
                        מלאי: {row.currentStock}{" "}
                        <span className="font-semibold text-slate-500">/ מינ׳ {row.minStock}</span>
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(row.lastStockAt)}</p>
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
