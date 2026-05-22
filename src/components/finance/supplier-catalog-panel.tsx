"use client";

import { AlertTriangle, Package, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";
import { formatShekel } from "@/lib/format-shekel";

export type SupplierCatalogProduct = {
  id: string;
  productName: string;
  regularPrice: number;
  lastPrice: number;
  unit: string | null;
  updatedAt: string;
  changePct: number;
  deviation: boolean;
};

type Props = {
  supplierId: string;
  supplierName: string;
  targetLineId: string | null;
  disabled?: boolean;
  onApplyToLine: (lineId: string, row: ProductPickerRow) => void;
};

function toPickerRow(p: SupplierCatalogProduct, supplierId: string, supplierName: string): ProductPickerRow {
  const last = p.lastPrice > 0 ? p.lastPrice : p.regularPrice;
  return {
    key: `sp:${p.id}`,
    name: p.productName,
    lastPrice: last,
    unit: p.unit,
    supplierId,
    supplierName,
    supplierProductId: p.id,
    productId: null,
    vatMode: "includes_vat",
  };
}

function fmtDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-IL" : locale === "he" ? "he-IL" : "en-IL", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function SupplierCatalogPanel({
  supplierId,
  supplierName,
  targetLineId,
  disabled,
  onApplyToLine,
}: Props) {
  const { t, locale, dir } = useI18n();
  const [products, setProducts] = useState<SupplierCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: SupplierCatalogProduct[] };
      setProducts(j.ok && Array.isArray(j.data) ? j.data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const filtered = products.filter((p) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return p.productName.toLowerCase().includes(q);
  });

  const applyRow = (p: SupplierCatalogProduct) => {
    if (!targetLineId || disabled) return;
    onApplyToLine(targetLineId, toPickerRow(p, supplierId, supplierName));
  };

  const updatePrice = async (p: SupplierCatalogProduct) => {
    const raw = window.prompt(t("register.procurement.newPricePrompt"), String(p.regularPrice));
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setBusyId(p.id);
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products/${encodeURIComponent(p.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ regularPrice: n, recordPrice: true }),
        },
      );
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const diffClass = (pct: number, deviation: boolean) => {
    if (pct > 0.5 || deviation) return "text-rose-700";
    if (pct < -0.5) return "text-emerald-700";
    return "text-slate-600";
  };

  const diffIcon = (pct: number) => {
    if (pct > 0.5) return <TrendingUp className="h-3.5 w-3.5 text-rose-600" aria-hidden />;
    if (pct < -0.5) return <TrendingDown className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
    return null;
  };

  return (
    <div
      dir={dir}
      className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100"
    >
      <div className="border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Package className="h-4 w-4 text-cyan-700" aria-hidden />
          {t("register.procurement.panelTitle")}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-slate-600">{supplierName}</p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("register.procurement.filterProducts")}
          className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/30"
        />
      </div>

      {loading ? (
        <p className="px-4 py-8 text-center text-sm font-bold text-slate-500">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm font-bold text-slate-500">{t("register.procurement.emptyProducts")}</p>
      ) : (
        <>
          <div className="hidden max-h-[min(420px,55vh)] overflow-auto md:block">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">{t("register.procurement.colProduct")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colRegular")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colLast")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colDiff")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colUnit")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colUpdated")}</th>
                  <th className="px-3 py-2.5">{t("register.procurement.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const diff = p.lastPrice - p.regularPrice;
                  return (
                    <tr
                      key={p.id}
                      className={`transition hover:bg-cyan-50/40 ${p.deviation ? "bg-rose-50/30" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-bold text-slate-900">{p.productName}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{formatShekel(p.regularPrice)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{formatShekel(p.lastPrice)}</td>
                      <td className={`px-3 py-2.5 tabular-nums text-xs font-black ${diffClass(p.changePct, p.deviation)}`}>
                        <span className="inline-flex items-center gap-1">
                          {diffIcon(p.changePct)}
                          {diff > 0 ? "+" : ""}
                          {formatShekel(diff)}
                          {p.deviation ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{p.unit ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(p.updatedAt, locale)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            disabled={disabled || !targetLineId || busyId === p.id}
                            onClick={() => applyRow(p)}
                            className="rounded-lg bg-cyan-700 px-2 py-1 text-[11px] font-black text-white hover:bg-cyan-800 disabled:opacity-40"
                          >
                            {t("register.procurement.useInLine")}
                          </button>
                          <button
                            type="button"
                            disabled={disabled || busyId === p.id}
                            onClick={() => void updatePrice(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
                          >
                            <Pencil className="h-3 w-3" />
                            {t("register.procurement.updatePrice")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="max-h-[min(420px,55vh)] space-y-2 overflow-auto p-3 md:hidden">
            {filtered.map((p) => {
              const diff = p.lastPrice - p.regularPrice;
              return (
                <article
                  key={p.id}
                  className={`rounded-xl border p-3 shadow-sm ${p.deviation ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`}
                >
                  <p className="font-black text-slate-900">{p.productName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span className="text-slate-500">{t("register.procurement.colRegular")}</span>
                    <span className="text-end font-bold tabular-nums">{formatShekel(p.regularPrice)}</span>
                    <span className="text-slate-500">{t("register.procurement.colLast")}</span>
                    <span className="text-end font-bold tabular-nums">{formatShekel(p.lastPrice)}</span>
                    <span className="text-slate-500">{t("register.procurement.colDiff")}</span>
                    <span className={`text-end font-black tabular-nums ${diffClass(p.changePct, p.deviation)}`}>
                      {diff > 0 ? "+" : ""}
                      {formatShekel(diff)}
                    </span>
                    <span className="text-slate-500">{t("register.procurement.colUnit")}</span>
                    <span className="text-end">{p.unit ?? "—"}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={disabled || !targetLineId}
                      onClick={() => applyRow(p)}
                      className="min-h-[44px] flex-1 rounded-xl bg-cyan-700 text-xs font-black text-white"
                    >
                      {t("register.procurement.useInLine")}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void updatePrice(p)}
                      className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs font-bold"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {!targetLineId ? (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-center text-[11px] font-bold text-amber-900">
          {t("register.procurement.pickLineHint")}
        </p>
      ) : null}
    </div>
  );
}
