"use client";

import {
  AlertTriangle,
  ArrowDown,
  Barcode,
  CheckCircle2,
  ChevronRight,
  Minus,
  Package,
  Pause,
  Play,
  Plus,
  Printer,
  ScanLine,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
  type CountLineStatus,
} from "./count-product-status";
import type { InventoryCountProductRow } from "./types";
import {
  useInventoryCountAutosave,
  type CountSaveState,
} from "./use-inventory-count-autosave";
import { countDiffMeta } from "./utils";

export type WorkspaceProduct = InventoryCountProductRow & {
  actual: number | null;
  diff: number | null;
  status: CountLineStatus;
};

type Props = {
  shelfName: string;
  countDate: string;
  onClose: () => void;
  onProductCounted: (productId: string, currentQuantity: number) => void;
  onAddProduct: () => void;
  refreshKey?: number;
};

export function InventoryCountWorkspace({
  shelfName,
  countDate,
  onClose,
  onProductCounted,
  onAddProduct,
  refreshKey = 0,
}: Props) {
  const { t, dir } = useI18n();
  const [products, setProducts] = useState<InventoryCountProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          location: shelfName.trim(),
          page: "1",
          pageSize: "500",
        });
        const res = await fetch(`/api/inventory/monthly-count?${params}`, {
          credentials: "same-origin",
        });
        const j = (await res.json()) as { data?: InventoryCountProductRow[] };
        if (!cancelled) setProducts(j.data ?? []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shelfName, refreshKey]);
  const tW = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.workspace.${key}`, vars);

  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [saveStateById, setSaveStateById] = useState<Record<string, CountSaveState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listQ, setListQ] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [paused, setPaused] = useState(false);
  const [lineHistory, setLineHistory] = useState<
    { createdAt: string; currentQuantity: number; difference: number; countedBy: string | null }[]
  >([]);
  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const setSaveState = useCallback((id: string, state: CountSaveState) => {
    setSaveStateById((p) => ({ ...p, [id]: state }));
  }, []);

  const handleSaved = useCallback(
    (r: { inventoryProductId: string; currentQuantity: number }) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === r.inventoryProductId
            ? {
                ...p,
                previousQuantity: r.currentQuantity,
                lastCountedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
      onProductCounted(r.inventoryProductId, r.currentQuantity);
    },
    [onProductCounted],
  );

  const { scheduleSave, seedSaved } = useInventoryCountAutosave({
    countDate,
    onSaved: handleSaved,
  });

  const rows: WorkspaceProduct[] = useMemo(() => {
    return products.map((p) => {
      const raw = actualById[p.id] ?? "";
      const actual = raw === "" ? null : Number(raw);
      const diff = actual === null || Number.isNaN(actual) ? null : actual - p.previousQuantity;
      const status = resolveCountLineStatus(actual, p.previousQuantity);
      return { ...p, actual, diff, status };
    });
  }, [products, actualById]);

  const filteredRows = useMemo(() => {
    const q = listQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.includes(q));
  }, [rows, listQ]);

  const stats = useMemo(() => {
    let counted = 0;
    let match = 0;
    let short = 0;
    let surplus = 0;
    let remaining = 0;
    for (const r of rows) {
      if (r.status === "uncounted") {
        remaining += 1;
        continue;
      }
      counted += 1;
      if (r.status === "match") match += 1;
      else if (r.status === "short") short += 1;
      else surplus += 1;
    }
    const total = rows.length;
    const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
    const accuracy = counted > 0 ? Math.round((match / counted) * 100) : 0;
    return { total, counted, remaining, match, short, surplus, pct, accuracy };
  }, [rows]);

  const selected = rows.find((r) => r.id === selectedId) ?? filteredRows[0] ?? null;

  useEffect(() => {
    if (!selectedId && filteredRows[0]) setSelectedId(filteredRows[0].id);
  }, [filteredRows, selectedId]);

  useEffect(() => {
    scanRef.current?.focus();
  }, [shelfName]);

  useEffect(() => {
    if (!selectedId) {
      setLineHistory([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/count-history?productId=${encodeURIComponent(selectedId)}`,
          { credentials: "same-origin" },
        );
        const j = (await res.json()) as {
          data?: {
            createdAt: string;
            currentQuantity: number;
            difference: number;
            countedBy?: { fullName: string } | null;
          }[];
        };
        if (cancelled) return;
        setLineHistory(
          (j.data ?? []).slice(0, 4).map((r) => ({
            createdAt: r.createdAt,
            currentQuantity: r.currentQuantity,
            difference: r.difference,
            countedBy: r.countedBy?.fullName ?? null,
          })),
        );
      } catch {
        if (!cancelled) setLineHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshKey]);

  const applyQty = useCallback(
    (productId: string, qty: number, systemQty: number) => {
      if (paused) return;
      const v = Math.max(0, qty);
      setActualById((p) => ({ ...p, [productId]: String(v) }));
      scheduleSave(productId, v, setSaveState);
      if (v === systemQty) seedSaved(productId, v);
    },
    [paused, scheduleSave, setSaveState, seedSaved],
  );

  const onQtyInput = (productId: string, value: string, systemQty: number) => {
    setActualById((p) => ({ ...p, [productId]: value }));
    const n = Number(value);
    if (value !== "" && Number.isFinite(n) && n >= 0) {
      scheduleSave(productId, n, setSaveState);
    } else {
      setSaveState(productId, "idle");
    }
  };

  const handleScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const hit =
      rows.find((r) => r.id === code) ??
      rows.find((r) => r.name.trim().toLowerCase() === code.toLowerCase()) ??
      rows.find((r) => r.name.toLowerCase().includes(code.toLowerCase()));
    if (!hit) {
      setScanValue("");
      return;
    }
    setSelectedId(hit.id);
    setScanValue("");
    queueMicrotask(() => qtyRef.current?.focus());
  };

  const displayQty = selected
    ? actualById[selected.id] ?? (selected.actual !== null ? String(selected.actual) : "")
    : "";

  const selectedDiff = selected?.diff ?? null;
  const dm =
    selectedDiff !== null ? countDiffMeta(selectedDiff, t) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950/40 backdrop-blur-sm"
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={tW("title", { area: shelfName })}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100 shadow-2xl">
        {/* Header */}
        <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100"
              aria-label={tW("close")}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700/80">
                {tW("kicker")}
              </p>
              <h2 className="truncate text-xl font-black text-slate-900 md:text-2xl">{shelfName}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? tW("resume") : tW("pause")}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
              >
                <Printer className="h-3.5 w-3.5" />
                {tW("print")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-black text-white shadow-md"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tW("finishCount")}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
              <span>{tW("progress", { counted: stats.counted, total: stats.total })}</span>
              <span className="tabular-nums text-sky-800">{stats.pct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200/80 ring-1 ring-slate-200/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 shadow-[0_0_16px_rgba(14,165,233,0.45)] transition-all duration-500 ease-out"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <ScanLine className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-sky-600 ltr:left-3 rtl:right-3" />
              <input
                ref={scanRef}
                type="text"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScan(scanValue);
                  }
                }}
                placeholder={tW("scanPlaceholder")}
                className="h-11 w-full rounded-2xl border-2 border-sky-300/80 bg-sky-50/50 pr-3 pl-10 text-sm font-bold outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ltr:pl-10 ltr:pr-3 rtl:pr-10 rtl:pl-3"
                autoComplete="off"
              />
            </div>
            <input
              type="date"
              value={countDate}
              readOnly
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
            />
          </div>
        </header>

        {/* 3 panels — DOM order for RTL: products (right), center, status (left) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(220px,280px)]">
          {/* Products list (right in RTL) */}
          <section className="flex min-h-0 flex-col border-b border-slate-200/80 lg:order-1 lg:border-b-0 lg:border-e">
            <div className="shrink-0 border-b border-slate-100 p-3">
              <h3 className="text-sm font-black text-slate-800">{tW("productList")}</h3>
              <input
                type="search"
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
                placeholder={tW("searchProduct")}
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-sky-400"
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {loading ? (
                <li className="py-12 text-center text-sm font-semibold text-slate-500">
                  {tW("loading")}
                </li>
              ) : filteredRows.length === 0 ? (
                <li className="py-12 text-center text-sm font-semibold text-slate-500">
                  {tW("empty")}
                </li>
              ) : (
                filteredRows.map((row) => {
                  const st = countStatusStyles(row.status);
                  const isSel = row.id === selected?.id;
                  const saveSt = saveStateById[row.id];
                  return (
                    <li key={row.id} className="mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(row.id);
                          queueMicrotask(() => qtyRef.current?.focus());
                        }}
                        className={`relative w-full overflow-hidden rounded-2xl border p-3 text-end transition-all duration-200 hover:-translate-y-0.5 ${st.row} ${
                          isSel ? "ring-2 ring-sky-400/80" : ""
                        }`}
                      >
                        <div
                          className={`pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-l ${st.glow} ltr:right-0 rtl:left-0`}
                        />
                        <div className="relative flex items-start gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/90 text-sky-700 ring-1 ring-white/80">
                            <Package className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-black leading-snug text-slate-900">{row.name}</p>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                              <span>
                                {tW("system")}: {row.previousQuantity}
                              </span>
                              <span>
                                {tW("counted")}:{" "}
                                {row.actual === null ? "—" : row.actual}
                              </span>
                              {row.diff !== null ? (
                                <span
                                  className={
                                    row.diff < 0
                                      ? "text-rose-700"
                                      : row.diff > 0
                                        ? "text-amber-700"
                                        : "text-emerald-700"
                                  }
                                >
                                  {row.diff > 0 ? "+" : ""}
                                  {row.diff}
                                </span>
                              ) : null}
                            </div>
                            <span className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black">
                              <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                              {countStatusLabel(row.status, t)}
                              {saveSt === "saving" || saveSt === "pending" ? (
                                <span className="text-sky-600"> · {tW("saving")}</span>
                              ) : null}
                              {saveSt === "saved" ? (
                                <span className="text-emerald-600"> · ✓</span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* Quick counter (center) */}
          <section className="flex min-h-0 flex-col border-b border-slate-200/80 bg-gradient-to-b from-white to-sky-50/40 lg:order-2 lg:border-b-0 lg:border-e">
            {selected ? (
              <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
                <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                  {tW("quickCount")}
                </p>
                <h3 className="mt-2 text-center text-lg font-black text-slate-900 md:text-xl">
                  {selected.name}
                </h3>
                {selected.unit ? (
                  <p className="text-center text-xs font-semibold text-slate-500">{selected.unit}</p>
                ) : null}

                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={paused}
                    onClick={() => {
                      const base =
                        displayQty === ""
                          ? selected.previousQuantity
                          : Number(displayQty);
                      applyQty(selected.id, (Number.isFinite(base) ? base : 0) - 1, selected.previousQuantity);
                    }}
                    className="grid h-14 w-14 place-items-center rounded-2xl border-2 border-slate-200 bg-white text-2xl font-black shadow-sm transition hover:scale-105 active:scale-95 touch-manipulation"
                  >
                    <Minus className="h-7 w-7" />
                  </button>
                  <input
                    ref={qtyRef}
                    type="number"
                    inputMode="decimal"
                    disabled={paused}
                    value={displayQty}
                    onChange={(e) =>
                      onQtyInput(selected.id, e.target.value, selected.previousQuantity)
                    }
                    className="h-20 w-32 rounded-3xl border-4 border-sky-400/80 bg-white text-center text-4xl font-black tabular-nums text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-200/60 md:h-24 md:w-40 md:text-5xl"
                  />
                  <button
                    type="button"
                    disabled={paused}
                    onClick={() => {
                      const base =
                        displayQty === ""
                          ? selected.previousQuantity
                          : Number(displayQty);
                      applyQty(selected.id, (Number.isFinite(base) ? base : 0) + 1, selected.previousQuantity);
                    }}
                    className="grid h-14 w-14 place-items-center rounded-2xl border-2 border-slate-200 bg-white text-2xl font-black shadow-sm transition hover:scale-105 active:scale-95 touch-manipulation"
                  >
                    <Plus className="h-7 w-7" />
                  </button>
                </div>

                <p className="mt-4 text-center text-sm font-bold text-slate-600">
                  {tW("system")}: {selected.previousQuantity}
                </p>

                {dm && selectedDiff !== null ? (
                  <div
                    className={`mx-auto mt-4 flex max-w-xs items-center justify-center gap-2 rounded-2xl px-4 py-3 ring-1 ${dm.badgeClass}`}
                  >
                    {selectedDiff < 0 ? (
                      <AlertTriangle className="h-5 w-5 text-rose-600" />
                    ) : selectedDiff > 0 ? (
                      <TrendingUp className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    )}
                    <span className="text-sm font-black" style={dm.diffStyle}>
                      {dm.label}: {selectedDiff > 0 ? "+" : ""}
                      {selectedDiff}
                    </span>
                  </div>
                ) : null}

                {lineHistory.length > 0 ? (
                  <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-end">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      {tW("movementHistory")}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {lineHistory.map((h, i) => (
                        <li
                          key={`${h.createdAt}-${i}`}
                          className="text-[11px] font-semibold text-slate-600"
                        >
                          {new Date(h.createdAt).toLocaleString()} · {h.currentQuantity}
                          {h.difference !== 0 ? (
                            <span
                              className={
                                h.difference < 0 ? " text-rose-600" : " text-amber-600"
                              }
                            >
                              {" "}
                              ({h.difference > 0 ? "+" : ""}
                              {h.difference})
                            </span>
                          ) : null}
                          {h.countedBy ? ` · ${h.countedBy}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap justify-center gap-2 pt-6">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold"
                    onClick={() => applyQty(selected.id, selected.previousQuantity, selected.previousQuantity)}
                  >
                    {tW("matchSystem")}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold"
                    onClick={() => {
                      const idx = filteredRows.findIndex((r) => r.id === selected.id);
                      const next = filteredRows[idx + 1];
                      if (next) setSelectedId(next.id);
                    }}
                  >
                    {tW("nextProduct")}
                    <ArrowDown className="inline h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-sm font-semibold text-slate-500">
                {tW("pickProduct")}
              </div>
            )}
          </section>

          {/* Status panel (left in RTL) */}
          <section className="flex min-h-0 flex-col bg-slate-900/95 p-4 text-white lg:order-3">
            <h3 className="text-sm font-black text-sky-100">{tW("liveStatus")}</h3>
            <ul className="mt-4 space-y-3 text-sm font-bold">
              <li className="flex justify-between gap-2">
                <span className="text-slate-300">{tW("counted")}</span>
                <span className="tabular-nums text-emerald-300">{stats.counted}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-300">{tW("remaining")}</span>
                <span className="tabular-nums text-violet-300">{stats.remaining}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-300">{tW("short")}</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-rose-300">
                  <TrendingDown className="h-4 w-4" />
                  {stats.short}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-300">{tW("surplus")}</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-amber-300">
                  <TrendingUp className="h-4 w-4" />
                  {stats.surplus}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-300">{tW("match")}</span>
                <span className="tabular-nums text-emerald-300">{stats.match}</span>
              </li>
            </ul>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {tW("accuracy")}
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.accuracy}%</p>
            </div>
            <button
              type="button"
              onClick={onAddProduct}
              className="mt-4 w-full rounded-xl border border-white/20 py-2.5 text-xs font-black text-white transition hover:bg-white/10"
            >
              + {tW("addProduct")}
            </button>
          </section>
        </div>

        {/* Summary footer */}
        <footer className="shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-700">
            <span className="inline-flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {tW("footerMatch", { n: stats.match })}
            </span>
            <span className="inline-flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              {tW("footerShort", { n: stats.short })}
            </span>
            <span className="inline-flex items-center gap-2 text-amber-700">
              <Barcode className="h-4 w-4" />
              {tW("footerSurplus", { n: stats.surplus })}
            </span>
            <span className="text-sky-800">{tW("footerAccuracy", { n: stats.accuracy })}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
