"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ScanLine, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import type { InventoryCountProductRow } from "@/components/ops/inventory-count/types";
import { AddShelfProductModal } from "./add-shelf-product-modal";
import { ShelfProductCard } from "./shelf-product-card";

type Props = {
  open: boolean;
  shelfName: string;
  locationId: string | null;
  countDate: string;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

function ShelfCountModalInner({
  open,
  shelfName,
  locationId,
  countDate,
  onClose,
  onSaved,
  t,
}: Props) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<InventoryCountProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actualById, setActualById] = useState<Record<string, string>>({});
  const [scanQ, setScanQ] = useState("");
  const [addProductOpen, setAddProductOpen] = useState(false);

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
    void loadProducts();
  }, [open, shelfName, loadProducts]);

  const sortedProducts = useMemo(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q) return products;
    const hit = products.filter(
      (p) =>
        p.id === q ||
        p.name.toLowerCase().includes(q) ||
        p.name.trim().toLowerCase() === q,
    );
    if (hit.length === 0) return products;
    const rest = products.filter((p) => !hit.includes(p));
    return [...hit, ...rest];
  }, [products, scanQ]);

  const fetchLastCount = useCallback(async (productId: string) => {
    try {
      const res = await fetch(
        `/api/inventory/count-history?productId=${encodeURIComponent(productId)}`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as {
        data?: {
          createdAt: string;
          currentQuantity: number;
          countedBy?: { fullName: string } | null;
        }[];
      };
      const row = j.data?.[0];
      if (!row) return null;
      return {
        createdAt: row.createdAt,
        currentQuantity: row.currentQuantity,
        countedBy: row.countedBy?.fullName ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  const saveAll = async () => {
    const lines = products
      .map((p) => {
        const raw = actualById[p.id] ?? "";
        const n = raw === "" ? null : Number(raw);
        if (n === null || Number.isNaN(n)) return null;
        return { inventoryProductId: p.id, currentQuantity: n };
      })
      .filter(Boolean) as { inventoryProductId: string; currentQuantity: number }[];

    if (lines.length === 0) {
      showToast({ tone: "warning", title: t("nothingToSave"), durationMs: 2500 });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/monthly-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ countDate, lines }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showToast({ tone: "error", title: j.error ?? t("saveFailed"), durationMs: 3000 });
        return;
      }
      showToast({ tone: "success", title: t("saved"), durationMs: 2000 });
      setActualById({});
      onSaved();
      onClose();
    } catch {
      showToast({ tone: "error", title: t("saveFailed"), durationMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-[24px] border border-[#e7ecf5] bg-[#f6f8fc] shadow-2xl sm:rounded-[24px]"
          role="dialog"
          aria-modal="true"
        >
          <header className="shrink-0 border-b border-[#e7ecf5] bg-white px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 text-end">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c4cff]">
                  {t("kicker")}
                </p>
                <h2 className="truncate text-xl font-black text-slate-900">{shelfName}</h2>
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
              />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#6c4cff]" />
              </div>
            ) : sortedProducts.length === 0 ? (
              <p className="py-12 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sortedProducts.map((row) => (
                  <ShelfProductCard
                    key={row.id}
                    row={row}
                    actualRaw={actualById[row.id] ?? ""}
                    onActualChange={(v) =>
                      setActualById((prev) => ({ ...prev, [row.id]: v }))
                    }
                    t={t}
                    onFetchLastCount={fetchLastCount}
                  />
                ))}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[#e7ecf5] bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {locationId ? (
                <button
                  type="button"
                  onClick={() => setAddProductOpen(true)}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-2xl border border-[#e7ecf5] text-sm font-black text-slate-700 sm:flex-none sm:px-4"
                >
                  <Plus className="h-4 w-4" />
                  {t("addProductBtn")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveAll()}
                className="inline-flex h-11 min-w-[10rem] flex-1 items-center justify-center rounded-2xl text-sm font-black text-white shadow-md disabled:opacity-60 sm:flex-[2]"
                style={{ background: "#16c784" }}
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : t("saveCount")}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {locationId ? (
        <AddShelfProductModal
          open={addProductOpen}
          shelfName={shelfName}
          locationId={locationId}
          onClose={() => setAddProductOpen(false)}
          onCreated={(p) => {
            setProducts((prev) => [...prev, p]);
            showToast({ tone: "success", title: t("productAdded"), durationMs: 1500 });
          }}
          t={(k) => t(`addProduct.${k}`)}
        />
      ) : null}
    </>
  );
}

export const ShelfCountModal = memo(ShelfCountModalInner);
