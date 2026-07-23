"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ScanLine,
  Settings2,
  X,
} from "lucide-react";
import type {
  InventoryCountProductRow,
  LocationWorkerDto,
} from "@/components/ops/inventory-count/types";
import { ShelfCountLineRow, ShelfCountTableHeader } from "./shelf-count-line-row";
import { LocationWorkersModal } from "./location-workers-modal";
import { ProductEditModal, type ProductEditValues } from "./product-edit-modal";

const ROW_HEIGHT = 104;
const REFRESH_SHELVES_MS = 1200;

type Props = {
  open: boolean;
  shelfName: string;
  locationId?: string | null;
  countDate: string;
  onClose: () => void;
  onShelfStatsChange?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

function ShelfCountModalInner({
  open,
  shelfName,
  locationId,
  countDate,
  onClose,
  onShelfStatsChange,
  t,
}: Props) {
  const [products, setProducts] = useState<InventoryCountProductRow[]>([]);
  const [workers, setWorkers] = useState<LocationWorkerDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [workersOpen, setWorkersOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductEditValues | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanQ, setScanQ] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const listRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadProducts = useCallback(async () => {
    if (!shelfName.trim() && !locationId?.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "500",
      });
      if (locationId?.trim()) params.set("locationId", locationId.trim());
      if (shelfName.trim()) params.set("location", shelfName.trim());
      const res = await fetch(`/api/inventory/monthly-count?${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        data?: InventoryCountProductRow[];
        meta?: { workers?: LocationWorkerDto[] };
      };
      setProducts(j.data ?? []);
      setWorkers(j.meta?.workers ?? []);
    } catch {
      setProducts([]);
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }, [shelfName, locationId]);

  useEffect(() => {
    if (!open) return;
    setActualById({});
    setSavingIds(new Set());
    setConfirmCloseOpen(false);
    setWorkersOpen(false);
    setEditProduct(null);
    setNotice(null);
    setError(null);
    setScanQ("");
    setScrollTop(0);
    void loadProducts();
  }, [open, shelfName, loadProducts]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, [open, loading, products.length]);

  const scheduleShelfRefresh = useCallback(() => {
    if (!onShelfStatsChange) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      onShelfStatsChange();
      refreshTimer.current = null;
    }, REFRESH_SHELVES_MS);
  }, [onShelfStatsChange]);

  const setActual = useCallback((productId: string, value: string) => {
    setNotice(null);
    setError(null);
    setActualById((prev) => ({ ...prev, [productId]: value }));
  }, []);

  const bump = useCallback((productId: string, systemQty: number, delta: number) => {
    setNotice(null);
    setError(null);
    setActualById((prev) => {
      const raw = prev[productId] ?? "";
      const base = raw === "" ? systemQty : Number(raw);
      const next = Math.max(0, (Number.isNaN(base) ? systemQty : base) + delta);
      return { ...prev, [productId]: String(next) };
    });
  }, []);

  const sortedProducts = useMemo(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q) return products;
    const hit = products.filter(
      (p) =>
        p.id === q ||
        (p.barcode ?? "").toLowerCase() === q ||
        (p.sku ?? "").toLowerCase() === q ||
        p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q) ||
        (p.nameEn ?? "").toLowerCase().includes(q),
    );
    if (hit.length === 0) return products;
    const hitSet = new Set(hit.map((p) => p.id));
    return [...hit, ...products.filter((p) => !hitSet.has(p.id))];
  }, [products, scanQ]);

  useEffect(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q || sortedProducts.length === 0) return;
    const first = sortedProducts[0];
    rowRefs.current.get(first.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scanQ, sortedProducts]);

  const useVirtual = sortedProducts.length > 40;
  const totalH = sortedProducts.length * ROW_HEIGHT;
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2) : 0;
  const endIdx = useVirtual
    ? Math.min(sortedProducts.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 2)
    : sortedProducts.length;
  const visible = sortedProducts.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_HEIGHT;
  const padBottom = Math.max(0, (sortedProducts.length - endIdx) * ROW_HEIGHT);
  const dirtyEntries = Object.entries(actualById).filter(([, raw]) => raw !== "");
  const hasDirtyChanges = dirtyEntries.length > 0;
  const hasInvalidChanges = dirtyEntries.some(([, raw]) => {
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0;
  });
  const minimumSummary = useMemo(() => {
    let below = 0;
    for (const product of products) {
      if (product.minimumQuantity <= 0) continue;
      const systemTotal = product.systemTotalQuantity ?? product.previousQuantity;
      if (systemTotal < product.minimumQuantity) below += 1;
    }
    return {
      total: products.length,
      below,
      ok: Math.max(0, products.length - below),
    };
  }, [products]);

  const saveCount = useCallback(
    async (opts?: { closeAfterSave?: boolean }) => {
      const lines = Object.entries(actualById)
        .map(([id, raw]) => ({ id, qty: raw === "" ? null : Number(raw) }))
        .filter((line): line is { id: string; qty: number } => {
          return line.qty !== null && Number.isFinite(line.qty) && line.qty >= 0;
        });

      if (lines.length === 0) {
        setError(t("nothingToSave"));
        return false;
      }

      setSavingAll(true);
      setError(null);
      setNotice(null);
      setSavingIds(new Set(lines.map((line) => line.id)));
      try {
        const res = await fetch("/api/inventory/monthly-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            countDate,
            location: shelfName.trim() || undefined,
            locationId: locationId?.trim() || undefined,
            lines: lines.map((line) => ({
              inventoryProductId: line.id,
              currentQuantity: line.qty,
            })),
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          data?: {
            saved?: number;
            rows?: { inventoryProductId: string; currentQuantity: number }[];
          };
        };

        if (!res.ok || !j.ok) {
          setError(j.error ?? t("saveFailed"));
          return false;
        }

        const savedRows = j.data?.rows ?? [];
        setProducts((prev) =>
          prev.map((product) => {
            const saved = savedRows.find((row) => row.inventoryProductId === product.id);
            return saved ? { ...product, previousQuantity: saved.currentQuantity } : product;
          }),
        );
        setActualById({});
        setConfirmCloseOpen(false);
        setNotice(t("savedSuccess"));
        scheduleShelfRefresh();
        if (opts?.closeAfterSave) onClose();
        return true;
      } catch {
        setError(t("saveFailed"));
        return false;
      } finally {
        setSavingAll(false);
        setSavingIds(new Set());
      }
    },
    [actualById, countDate, locationId, onClose, scheduleShelfRefresh, shelfName, t],
  );

  const requestClose = useCallback(() => {
    if (savingAll) return;
    if (hasDirtyChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  }, [hasDirtyChanges, onClose, savingAll]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-md sm:items-center sm:p-3">
      <div
        className="flex max-h-[100dvh] w-full max-w-[100vw] flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:max-h-[94vh] sm:w-[min(96vw,1600px)] sm:rounded-[24px]"
        role="dialog"
        aria-modal="true"
        dir="rtl"
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-[#e7ecf5]/80 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c4cff]">
                {t("kicker")}
              </p>
              <h2 className="truncate text-lg font-black text-slate-900 sm:text-xl">{shelfName}</h2>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!locationId}
              onClick={() => setWorkersOpen(true)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40 sm:flex-none"
            >
              <Settings2 className="h-4 w-4" />
              {t("editWorkers")}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
            <div className="rounded-2xl bg-slate-50 px-2 py-2 text-slate-700 ring-1 ring-slate-200">
              <p className="text-[10px] text-slate-500">{t("summaryTotal")}</p>
              <p className="text-base tabular-nums">{minimumSummary.total}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-2 py-2 text-emerald-700 ring-1 ring-emerald-200">
              <p className="text-[10px]">{t("summaryOk")}</p>
              <p className="text-base tabular-nums">{minimumSummary.ok}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-2 py-2 text-rose-700 ring-1 ring-rose-200">
              <p className="text-[10px]">{t("summaryBelowMinimum")}</p>
              <p className="text-base tabular-nums">{minimumSummary.below}</p>
            </div>
          </div>

          {notice ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="relative mt-3">
            <ScanLine className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c4cff] ltr:left-3 rtl:right-3" />
            <input
              type="text"
              value={scanQ}
              onChange={(e) => setScanQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder={t("scanPlaceholder")}
              className="h-12 w-full rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] pr-3 pl-10 text-sm font-bold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/15 ltr:pl-10 ltr:pr-3 rtl:pr-10 rtl:pl-3"
              autoFocus
            />
          </div>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain p-3 sm:p-4"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#6c4cff]" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
          ) : (
            <div className="min-w-max" style={{ minHeight: useVirtual ? totalH : undefined }}>
              <div className="sticky top-0 z-[1] mb-2 bg-white/95 pb-1 backdrop-blur-sm">
                <ShelfCountTableHeader workers={workers} t={t} />
              </div>
              {useVirtual ? <div style={{ height: padTop }} aria-hidden /> : null}
              <div className="space-y-2">
                {visible.map((row) => (
                  <div
                    key={row.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.id, el);
                      else rowRefs.current.delete(row.id);
                    }}
                  >
                    <ShelfCountLineRow
                      id={row.id}
                      name={row.name}
                      barcode={row.barcode ?? null}
                      sku={row.sku ?? null}
                      unit={row.unit}
                      systemQty={row.previousQuantity}
                      systemTotalQuantity={row.systemTotalQuantity ?? row.previousQuantity}
                      systemShortage={
                        row.systemShortage ??
                        Math.max(
                          0,
                          (row.minimumQuantity || 0) -
                            (row.systemTotalQuantity ?? row.previousQuantity),
                        )
                      }
                      minimumQuantity={row.minimumQuantity}
                      workers={workers}
                      actualRaw={actualById[row.id] ?? ""}
                      saving={savingIds.has(row.id)}
                      showColumnLabels={false}
                      onActualChange={(v) => setActual(row.id, v)}
                      onBump={(d) => bump(row.id, row.previousQuantity, d)}
                      onEditProduct={() =>
                        setEditProduct({
                          id: row.id,
                          nameHe: row.nameHe ?? row.name,
                          nameAr: row.nameAr ?? "",
                          nameEn: row.nameEn ?? "",
                          barcode: row.barcode ?? "",
                          sku: row.sku ?? "",
                          unit: row.unit ?? "",
                        })
                      }
                      t={t}
                    />
                  </div>
                ))}
              </div>
              {useVirtual ? <div style={{ height: padBottom }} aria-hidden /> : null}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-[#e7ecf5]/80 bg-white/95 px-3 py-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            onClick={requestClose}
            disabled={savingAll}
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void saveCount()}
            disabled={savingAll || !hasDirtyChanges || hasInvalidChanges}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {savingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {t("saveCount")}
          </button>
        </footer>
      </div>

      {confirmCloseOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-5 text-end shadow-2xl" dir="rtl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-900">{t("unsavedTitle")}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{t("unsavedBody")}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void saveCount({ closeAfterSave: true })}
                disabled={savingAll || hasInvalidChanges}
                className="min-h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {t("saveAndExit")}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={savingAll}
                className="min-h-12 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {t("exitWithoutSaving")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                disabled={savingAll}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {t("backToEdit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LocationWorkersModal
        open={workersOpen}
        locationId={locationId ?? null}
        onClose={() => setWorkersOpen(false)}
        onSaved={(next) => setWorkers(next)}
        t={t}
      />

      <ProductEditModal
        open={editProduct !== null}
        initial={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={(p) => {
          setProducts((prev) =>
            prev.map((row) =>
              row.id === p.id
                ? {
                    ...row,
                    name: p.name,
                    nameHe: p.nameHe,
                    nameAr: p.nameAr || null,
                    nameEn: p.nameEn || null,
                    barcode: p.barcode || null,
                    sku: p.sku || null,
                    unit: p.unit || null,
                  }
                : row,
            ),
          );
          setNotice(t("productUpdated"));
        }}
        t={t}
      />
    </div>
  );
}

export const ShelfCountModal = memo(ShelfCountModalInner);
