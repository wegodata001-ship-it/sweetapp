"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import type { InventoryCountProductRow } from "@/components/ops/inventory-count/types";
import { ShelfCountLineRow } from "./shelf-count-line-row";

const ROW_HEIGHT = 76;
const SAVE_DEBOUNCE_MS = 400;
const REFRESH_SHELVES_MS = 1200;

type Props = {
  open: boolean;
  shelfName: string;
  countDate: string;
  onClose: () => void;
  onShelfStatsChange?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

function shortBarcode(id: string) {
  const clean = id.replace(/-/g, "");
  return clean.length > 10 ? clean.slice(0, 10).toUpperCase() : clean.toUpperCase();
}

function ShelfCountModalInner({
  open,
  shelfName,
  countDate,
  onClose,
  onShelfStatsChange,
  t,
}: Props) {
  const [products, setProducts] = useState<InventoryCountProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [scanQ, setScanQ] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const listRef = useRef<HTMLDivElement>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadProducts = useCallback(async () => {
    if (!shelfName.trim()) return;
    setLoading(true);
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
      setProducts(j.data ?? []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [shelfName]);

  useEffect(() => {
    if (!open) return;
    setActualById({});
    setScanQ("");
    setScrollTop(0);
    void loadProducts();
    return () => {
      for (const id of saveTimers.current.keys()) {
        const tm = saveTimers.current.get(id);
        if (tm) clearTimeout(tm);
      }
      saveTimers.current.clear();
    };
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

  const persistLine = useCallback(
    async (productId: string, qty: number) => {
      setSavingIds((prev) => new Set(prev).add(productId));
      try {
        const res = await fetch("/api/inventory/count-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            inventoryProductId: productId,
            currentQuantity: qty,
            countDate,
          }),
        });
        const j = (await res.json()) as { ok?: boolean };
        if (j.ok) scheduleShelfRefresh();
      } catch {
        /* silent — user can retry by editing */
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [countDate, scheduleShelfRefresh],
  );

  const queueSave = useCallback(
    (productId: string, raw: string) => {
      const prev = saveTimers.current.get(productId);
      if (prev) clearTimeout(prev);
      const n = raw === "" ? null : Number(raw);
      if (n === null || Number.isNaN(n) || n < 0) return;
      saveTimers.current.set(
        productId,
        setTimeout(() => {
          saveTimers.current.delete(productId);
          void persistLine(productId, n);
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [persistLine],
  );

  const setActual = useCallback(
    (productId: string, value: string) => {
      setActualById((prev) => ({ ...prev, [productId]: value }));
      queueSave(productId, value);
    },
    [queueSave],
  );

  const bump = useCallback(
    (productId: string, systemQty: number, delta: number) => {
      setActualById((prev) => {
        const raw = prev[productId] ?? "";
        const base = raw === "" ? systemQty : Number(raw);
        const next = Math.max(0, (Number.isNaN(base) ? systemQty : base) + delta);
        const str = String(next);
        queueSave(productId, str);
        return { ...prev, [productId]: str };
      });
    },
    [queueSave],
  );

  const sortedProducts = useMemo(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q) return products;
    const hit = products.filter(
      (p) =>
        p.id === q ||
        shortBarcode(p.id).toLowerCase() === q ||
        p.name.toLowerCase().includes(q),
    );
    if (hit.length === 0) return products;
    const hitSet = new Set(hit.map((p) => p.id));
    return [...hit, ...products.filter((p) => !hitSet.has(p.id))];
  }, [products, scanQ]);

  useEffect(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q || sortedProducts.length === 0) return;
    const first = sortedProducts[0];
    const el = rowRefs.current.get(first.id);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scanQ, sortedProducts]);

  const useVirtual = sortedProducts.length > 60;
  const totalH = sortedProducts.length * ROW_HEIGHT;
  const startIdx = useVirtual
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4)
    : 0;
  const endIdx = useVirtual
    ? Math.min(
        sortedProducts.length,
        Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 4,
      )
    : sortedProducts.length;
  const visible = sortedProducts.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_HEIGHT;
  const padBottom = Math.max(0, (sortedProducts.length - endIdx) * ROW_HEIGHT);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-md sm:items-center sm:p-4">
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-[24px]"
        role="dialog"
        aria-modal="true"
        dir="rtl"
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-[#e7ecf5]/80 bg-white/90 px-4 py-4 backdrop-blur-md sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c4cff]">
                {t("kicker")}
              </p>
              <h2 className="truncate text-xl font-black text-slate-900">{shelfName}</h2>
              <p className="text-xs font-semibold text-slate-500">
                {t("autosaveHint")}
              </p>
            </div>
          </div>
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
              className="h-11 w-full rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] pr-3 pl-10 text-sm font-bold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/15 ltr:pl-10 ltr:pr-3 rtl:pr-10 rtl:pl-3"
              autoFocus
            />
          </div>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#6c4cff]" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
          ) : (
            <div style={{ minHeight: useVirtual ? totalH : undefined }}>
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
                      barcode={shortBarcode(row.id)}
                      unit={row.unit}
                      systemQty={row.previousQuantity}
                      actualRaw={actualById[row.id] ?? ""}
                      saving={savingIds.has(row.id)}
                      onActualChange={(v) => setActual(row.id, v)}
                      onBump={(d) => bump(row.id, row.previousQuantity, d)}
                      t={t}
                    />
                  </div>
                ))}
              </div>
              {useVirtual ? <div style={{ height: padBottom }} aria-hidden /> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ShelfCountModal = memo(ShelfCountModalInner);
