"use client";

import { AlertTriangle, History, Package, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  updatedAt: string;
  productCount: number;
};

type ProductRow = {
  id: string;
  productName: string;
  regularPrice: number;
  unit: string | null;
  lastPrice: number;
  changePct: number;
  deviation: boolean;
};

export default function SuppliersPricesPage() {
  const { t, bcp47 } = useI18n();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierQ, setSupplierQ] = useState("");
  const [debouncedSupplierQ, setDebouncedSupplierQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productQ, setProductQ] = useState("");
  const [debouncedProductQ, setDebouncedProductQ] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyDeviations, setOnlyDeviations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [supplierModal, setSupplierModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [priceModal, setPriceModal] = useState<{ id: string; name: string; current: number } | null>(null);
  const [newPriceStr, setNewPriceStr] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<{ price: number; recordedAt: string }[]>([]);

  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", email: "", notes: "" });
  const [newProduct, setNewProduct] = useState({ name: "", regularPrice: "", unit: "", notes: "" });

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSupplierQ(supplierQ.trim()), 300);
    return () => window.clearTimeout(id);
  }, [supplierQ]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedProductQ(productQ.trim()), 300);
    return () => window.clearTimeout(id);
  }, [productQ]);

  const loadSuppliers = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSupplierQ) params.set("q", debouncedSupplierQ);
      const res = await fetch(`/api/procurement/suppliers?${params}`, { credentials: "same-origin" });
      const j = (await res.json()) as { ok?: boolean; data?: SupplierRow[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setSuppliers(j.data ?? []);
    } catch {
      setLoadError(t("procurement.loadError"));
      setSuppliers([]);
    }
  }, [debouncedSupplierQ, t]);

  const loadProducts = useCallback(async () => {
    if (!selectedId) {
      setProducts([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (debouncedProductQ) params.set("q", debouncedProductQ);
      if (minPrice.trim()) params.set("minPrice", minPrice.trim());
      if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
      if (onlyDeviations) params.set("onlyDeviations", "1");
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(selectedId)}/products?${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: ProductRow[] };
      if (!res.ok || !j.ok) throw new Error("err");
      setProducts(j.data ?? []);
    } catch {
      setProducts([]);
    }
  }, [selectedId, debouncedProductQ, minPrice, maxPrice, onlyDeviations]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedId) ?? null,
    [suppliers, selectedId],
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(bcp47 === "ar" ? "ar" : bcp47 === "en" ? "en-GB" : "he-IL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const saveSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: newSupplier.name.trim(),
          phone: newSupplier.phone.trim() || null,
          email: newSupplier.email.trim() || null,
          notes: newSupplier.notes.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error);
      setSupplierModal(false);
      setNewSupplier({ name: "", phone: "", email: "", notes: "" });
      setNotice(t("procurement.noticeSaved"));
      await loadSuppliers();
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async () => {
    if (!selectedId || !newProduct.name.trim()) return;
    const pr = Number(newProduct.regularPrice);
    if (!Number.isFinite(pr) || pr < 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(selectedId)}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productName: newProduct.name.trim(),
          regularPrice: pr,
          unit: newProduct.unit.trim() || null,
          notes: newProduct.notes.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error);
      setProductModal(false);
      setNewProduct({ name: "", regularPrice: "", unit: "", notes: "" });
      setNotice(t("procurement.noticeSaved"));
      await loadSuppliers();
      await loadProducts();
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const saveNewPrice = async () => {
    if (!selectedId || !priceModal) return;
    const pr = Number(newPriceStr);
    if (!Number.isFinite(pr) || pr < 0) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(selectedId)}/products/${encodeURIComponent(priceModal.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ regularPrice: pr, recordPrice: true }),
        },
      );
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      setPriceModal(null);
      setNewPriceStr("");
      setNotice(t("procurement.noticeSaved"));
      await loadProducts();
      await loadSuppliers();
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!selectedId) return;
    if (!window.confirm(t("procurement.delete"))) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(selectedId)}/products/${encodeURIComponent(productId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      setNotice(t("procurement.noticeSaved"));
      await loadProducts();
      await loadSuppliers();
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (id: string, name: string) => {
    if (!selectedId) return;
    setHistoryFor({ id, name });
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(selectedId)}/products/${encodeURIComponent(id)}/history`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean; data?: { price: number; recordedAt: string }[] };
      setHistoryRows(j.ok ? j.data ?? [] : []);
    } catch {
      setHistoryRows([]);
    }
  };

  const supplierCardClass = (id: string) =>
    `w-full rounded-2xl border px-4 py-3 text-right transition ${
      selectedId === id
        ? "border-sky-400 bg-sky-50 shadow-[0_0_14px_rgba(56,189,248,0.28)] ring-1 ring-sky-200/80"
        : "border-slate-200 bg-white hover:border-slate-300"
    }`;

  const renderSupplierList = (variant: "desktop" | "mobile") => (
    <div className={variant === "mobile" ? "space-y-2" : "flex max-h-[min(72vh,640px)] flex-col gap-2 overflow-y-auto pr-1"}>
      {suppliers.map((s) =>
        variant === "mobile" ? (
          <details
            key={s.id}
            className="rounded-2xl border border-slate-200 bg-white open:shadow-sm"
            onToggle={(e) => {
              const el = e.target as HTMLDetailsElement;
              if (el.open) setSelectedId(s.id);
              else if (selectedId === s.id) setSelectedId(null);
            }}
          >
            <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-slate-900">{s.name}</span>
                <span className="text-xs font-bold tabular-nums text-slate-500">
                  {t("procurement.productCount", { count: s.productCount })}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{s.phone ?? "—"}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {t("procurement.lastUpdated")}: {fmtDate(s.updatedAt)}
              </p>
            </summary>
            {selectedId === s.id ? (
              <div className="border-t border-slate-100 bg-slate-50/70 p-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setProductModal(true)}
                  className="mb-3 w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-black text-luxury-navy-rich"
                >
                  {t("procurement.addProduct")}
                </button>
                {renderFiltersAndTable()}
              </div>
            ) : null}
          </details>
        ) : (
          <button key={s.id} type="button" onClick={() => setSelectedId(s.id)} className={supplierCardClass(s.id)}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-black text-slate-900">{s.name}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                {s.productCount}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-600">{s.phone ?? "—"}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {t("procurement.lastUpdated")}: {fmtDate(s.updatedAt)}
            </p>
          </button>
        ),
      )}
      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">{t("procurement.noSuppliers")}</p>
      ) : null}
    </div>
  );

  const renderFiltersAndTable = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <label className="min-w-[8rem] flex-1 text-xs font-bold text-slate-600">
          {t("procurement.filterProduct")}
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white py-2 pe-9 ps-2 text-sm font-semibold outline-none focus:border-luxury-gold"
              placeholder={t("procurement.filterProduct")}
            />
          </div>
        </label>
        <label className="w-[6.5rem] text-xs font-bold text-slate-600">
          {t("procurement.filterMin")}
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm"
          />
        </label>
        <label className="w-[6.5rem] text-xs font-bold text-slate-600">
          {t("procurement.filterMax")}
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={onlyDeviations} onChange={(e) => setOnlyDeviations(e.target.checked)} />
          {t("procurement.filterDeviations")}
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[720px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-bold text-slate-700">{t("procurement.colProduct")}</th>
              <th className="px-3 py-2 font-bold text-slate-700">{t("procurement.colRegular")}</th>
              <th className="px-3 py-2 font-bold text-slate-700">{t("procurement.colLast")}</th>
              <th className="px-3 py-2 font-bold text-slate-700">{t("procurement.colChange")}</th>
              <th className="px-3 py-2 font-bold text-slate-700">{t("procurement.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className={p.deviation ? "bg-rose-50/50" : ""}>
                <td className="px-3 py-2 font-bold text-slate-900">
                  <span className="flex flex-wrap items-center gap-2">
                    {p.productName}
                    {p.deviation ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {t("procurement.deviationBadge")}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums font-semibold">{formatShekel(p.regularPrice)}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{formatShekel(p.lastPrice)}</td>
                <td
                  className={`px-3 py-2 text-sm font-black tabular-nums ${
                    p.changePct > 0.5 ? "text-rose-700" : p.changePct < -0.5 ? "text-emerald-700" : "text-slate-600"
                  }`}
                >
                  {p.changePct > 0 ? "+" : ""}
                  {p.changePct.toFixed(1)}%
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPriceModal({ id: p.id, name: p.productName, current: p.regularPrice });
                        setNewPriceStr(String(p.regularPrice));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("procurement.updatePrice")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openHistory(p.id, p.productName)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                    >
                      <History className="h-3.5 w-3.5" />
                      {t("procurement.history")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteProduct(p.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("procurement.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {selectedId && products.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-600">{t("procurement.selectSupplierHint")}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 pt-2" dir="rtl">
      <header className="app-panel px-5 py-5 md:px-7 md:py-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Truck className="h-4 w-4 text-luxury-gold" aria-hidden />
          {t("nav.sectionFinance")}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="erp-page-title text-slate-950">{t("procurement.pageTitle")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{t("procurement.pageSubtitle")}</p>
            <p className="mt-2 text-xs text-slate-500">{t("procurement.ocrNote")}</p>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Package className="h-6 w-6" aria-hidden />
          </div>
        </div>
        {notice ? <p className="mt-4 text-sm font-bold text-emerald-800">{notice}</p> : null}
        {loadError ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {loadError}
          </p>
        ) : null}
      </header>

      <div className="hidden gap-4 md:grid md:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
        <aside className="app-panel flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">{t("procurement.suppliersTitle")}</h2>
            <button
              type="button"
              onClick={() => setSupplierModal(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-luxury-navy-rich px-3 py-2 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" />
              {t("procurement.addSupplier")}
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={supplierQ}
              onChange={(e) => setSupplierQ(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pe-10 ps-3 text-sm font-semibold outline-none focus:border-luxury-gold"
              placeholder={t("procurement.searchSupplier")}
            />
          </div>
          {renderSupplierList("desktop")}
        </aside>

        <section className="app-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">{t("procurement.productsTitle")}</h2>
            <button
              type="button"
              disabled={!selectedId || busy}
              onClick={() => setProductModal(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-luxury-navy-rich disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {t("procurement.addProduct")}
            </button>
          </div>
          {!selectedId ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600">
              {t("procurement.selectSupplierHint")}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-500">
                {selectedSupplier?.name} — {t("procurement.productCount", { count: selectedSupplier?.productCount ?? 0 })}
              </p>
              {renderFiltersAndTable()}
            </>
          )}
        </section>
      </div>

      <div className="space-y-3 md:hidden">
        <div className="app-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">{t("procurement.suppliersTitle")}</h2>
            <button
              type="button"
              onClick={() => setSupplierModal(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-luxury-navy-rich px-3 py-2 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" />
              {t("procurement.addSupplier")}
            </button>
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={supplierQ}
              onChange={(e) => setSupplierQ(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pe-10 ps-3 text-sm font-semibold outline-none focus:border-luxury-gold"
              placeholder={t("procurement.searchSupplier")}
            />
          </div>
          <div className="mt-3">{renderSupplierList("mobile")}</div>
        </div>
      </div>

      {supplierModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir="rtl">
            <h3 className="text-lg font-black">{t("procurement.modalSupplierTitle")}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldName")} *
                <input
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldPhone")}
                <input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldEmail")}
                <input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldNotes")}
                <textarea
                  value={newSupplier.notes}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600" onClick={() => setSupplierModal(false)}>
                {t("procurement.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveSupplier()}
                className="rounded-xl bg-luxury-gold px-4 py-2 text-sm font-black text-luxury-charcoal disabled:opacity-50"
              >
                {t("procurement.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productModal && selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir="rtl">
            <h3 className="text-lg font-black">{t("procurement.modalProductTitle")}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.colProduct")} *
                <input
                  value={newProduct.name}
                  onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldRegularPrice")} *
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newProduct.regularPrice}
                  onChange={(e) => setNewProduct((s) => ({ ...s, regularPrice: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldUnit")}
                <input
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct((s) => ({ ...s, unit: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                {t("procurement.fieldNotes")}
                <textarea
                  value={newProduct.notes}
                  onChange={(e) => setNewProduct((s) => ({ ...s, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600" onClick={() => setProductModal(false)}>
                {t("procurement.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveProduct()}
                className="rounded-xl bg-luxury-gold px-4 py-2 text-sm font-black text-luxury-charcoal disabled:opacity-50"
              >
                {t("procurement.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {priceModal && selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir="rtl">
            <h3 className="text-lg font-black">{t("procurement.priceDialogTitle")}</h3>
            <p className="mt-1 text-sm text-slate-600">{priceModal.name}</p>
            <label className="mt-4 block text-xs font-bold text-slate-600">
              {t("procurement.newPrice")}
              <input
                type="number"
                min={0}
                step="0.01"
                value={newPriceStr}
                onChange={(e) => setNewPriceStr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600"
                onClick={() => {
                  setPriceModal(null);
                  setNewPriceStr("");
                }}
              >
                {t("procurement.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveNewPrice()}
                className="rounded-xl bg-luxury-gold px-4 py-2 text-sm font-black text-luxury-charcoal disabled:opacity-50"
              >
                {t("procurement.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyFor && selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir="rtl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-black">{t("procurement.historyTitle")}</h3>
              <button type="button" className="text-sm font-bold text-slate-500" onClick={() => setHistoryFor(null)}>
                {t("procurement.close")}
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">{historyFor.name}</p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-bold text-slate-600">
                  <th className="py-2 text-right">{t("procurement.date")}</th>
                  <th className="py-2 text-right">{t("procurement.price")}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((h, i) => (
                  <tr key={`${h.recordedAt}-${i}`} className="border-b border-slate-100">
                    <td className="py-2">{fmtDate(h.recordedAt)}</td>
                    <td className="py-2 font-bold tabular-nums">{formatShekel(h.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
