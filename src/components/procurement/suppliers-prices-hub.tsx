"use client";

import {
  ChevronDown,
  Copy,
  History,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
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
  notes: string | null;
  updatedAt: string;
  lastPrice: number;
  lastRecordedAt: string | null;
  changePct: number;
  deviation: boolean;
};

const SUPPLIER_GRADIENTS = [
  { from: "#ddd6fe", to: "#bfdbfe" },
  { from: "#a7f3d0", to: "#99f6e4" },
  { from: "#fde68a", to: "#fed7aa" },
  { from: "#fbcfe8", to: "#e9d5ff" },
  { from: "#bae6fd", to: "#c7d2fe" },
];

const inputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300/40";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/50 bg-white/70 text-slate-700 shadow-sm transition hover:bg-white hover:text-slate-900 disabled:opacity-40";

function priceBorderClass(p: ProductRow): string {
  if (p.changePct > 0.5 || p.deviation) return "border-rose-200/90 bg-rose-50/30 ring-rose-100";
  if (p.changePct < -0.5) return "border-emerald-200/90 bg-emerald-50/30 ring-emerald-100";
  return "border-slate-200/90 bg-white ring-slate-100";
}

export function SuppliersPricesHub() {
  const { t, bcp47, dir } = useI18n();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierQ, setSupplierQ] = useState("");
  const [debouncedSupplierQ, setDebouncedSupplierQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [productsBySupplier, setProductsBySupplier] = useState<Record<string, ProductRow[]>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);
  const [productQ, setProductQ] = useState("");
  const [debouncedProductQ, setDebouncedProductQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyDeviations, setOnlyDeviations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", email: "", notes: "" });
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editSupplier, setEditSupplier] = useState({ name: "", phone: "", email: "", notes: "" });

  const [addProductFor, setAddProductFor] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ name: "", regularPrice: "", unit: "", notes: "" });
  const [editingProduct, setEditingProduct] = useState<{
    supplierId: string;
    id: string;
    name: string;
    regularPrice: string;
    unit: string;
    notes: string;
  } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ supplierId: string; id: string; name: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<{ price: number; recordedAt: string }[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSupplierQ(supplierQ.trim()), 300);
    return () => window.clearTimeout(id);
  }, [supplierQ]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedProductQ(productQ.trim()), 300);
    return () => window.clearTimeout(id);
  }, [productQ]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

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

  const loadProducts = useCallback(
    async (supplierId: string) => {
      setLoadingProducts(supplierId);
      try {
        const params = new URLSearchParams();
        if (debouncedProductQ) params.set("q", debouncedProductQ);
        if (onlyDeviations) params.set("onlyDeviations", "1");
        const res = await fetch(
          `/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products?${params}`,
          { credentials: "same-origin" },
        );
        const j = (await res.json()) as { ok?: boolean; data?: ProductRow[] };
        if (!res.ok || !j.ok) throw new Error("err");
        setProductsBySupplier((prev) => ({ ...prev, [supplierId]: j.data ?? [] }));
      } catch {
        setProductsBySupplier((prev) => ({ ...prev, [supplierId]: [] }));
      } finally {
        setLoadingProducts(null);
      }
    },
    [debouncedProductQ, onlyDeviations],
  );

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (expandedId) void loadProducts(expandedId);
  }, [expandedId, loadProducts]);

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setAddProductFor(null);
    setEditingProduct(null);
    setHistoryFor(null);
  };

  const refreshAll = async (supplierId?: string) => {
    await loadSuppliers();
    if (supplierId) await loadProducts(supplierId);
    else if (expandedId) await loadProducts(expandedId);
  };

  const saveSupplier = async (isEdit: boolean, id?: string) => {
    const payload = isEdit
      ? { name: editSupplier.name, phone: editSupplier.phone || null, email: editSupplier.email || null, notes: editSupplier.notes || null }
      : {
          name: newSupplier.name,
          phone: newSupplier.phone || null,
          email: newSupplier.email || null,
          notes: newSupplier.notes || null,
        };
    if (!payload.name?.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(
        isEdit && id ? `/api/procurement/suppliers/${encodeURIComponent(id)}` : "/api/procurement/suppliers",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        },
      );
      const j = (await res.json()) as { ok?: boolean; data?: { id: string }; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error);
      setShowAddSupplier(false);
      setEditingSupplierId(null);
      setNewSupplier({ name: "", phone: "", email: "", notes: "" });
      setNotice(t("procurement.noticeSaved"));
      const createdId = !isEdit ? j.data?.id : id;
      await refreshAll(createdId ?? expandedId ?? undefined);
      if (!isEdit && j.data?.id) {
        setExpandedId(j.data.id);
        setAddProductFor(j.data.id);
      }
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteSupplier = async (id: string, name: string) => {
    if (!window.confirm(t("procurement.confirmDeleteSupplier", { name }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      if (expandedId === id) setExpandedId(null);
      setNotice(t("procurement.noticeSaved"));
      await loadSuppliers();
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const duplicateSupplier = async (s: SupplierRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(s.id)}/products`, {
        credentials: "same-origin",
      });
      const pj = (await res.json()) as { ok?: boolean; data?: ProductRow[] };
      const products = pj.ok ? pj.data ?? [] : [];

      const createRes = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: `${s.name} ${t("procurement.copySuffix")}`,
          phone: s.phone,
          email: null,
          notes: null,
        }),
      });
      const cj = (await createRes.json()) as { ok?: boolean; data?: { id: string } };
      if (!createRes.ok || !cj.ok || !cj.data?.id) throw new Error("err");
      const newId = cj.data.id;

      for (const p of products) {
        await fetch(`/api/procurement/suppliers/${encodeURIComponent(newId)}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            productName: p.productName,
            regularPrice: p.regularPrice,
            unit: p.unit,
            notes: p.notes,
          }),
        });
      }
      setNotice(t("procurement.noticeSaved"));
      await loadSuppliers();
      setExpandedId(newId);
      await loadProducts(newId);
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async (supplierId: string, isEdit: boolean) => {
    if (isEdit && editingProduct) {
      const pr = Number(editingProduct.regularPrice);
      if (!editingProduct.name.trim() || !Number.isFinite(pr) || pr < 0) return;
      setBusy(true);
      try {
        const res = await fetch(
          `/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products/${encodeURIComponent(editingProduct.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              productName: editingProduct.name.trim(),
              regularPrice: pr,
              unit: editingProduct.unit.trim() || null,
              notes: editingProduct.notes.trim() || null,
              recordPrice: true,
            }),
          },
        );
        const j = (await res.json()) as { ok?: boolean };
        if (!res.ok || !j.ok) throw new Error("err");
        setEditingProduct(null);
        setNotice(t("procurement.noticeSaved"));
        await refreshAll(supplierId);
      } catch {
        setNotice(t("procurement.loadError"));
      } finally {
        setBusy(false);
      }
      return;
    }

    const pr = Number(newProduct.regularPrice);
    if (!newProduct.name.trim() || !Number.isFinite(pr) || pr < 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products`, {
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
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      setNewProduct({ name: "", regularPrice: "", unit: "", notes: "" });
      setAddProductFor(null);
      setNotice(t("procurement.noticeSaved"));
      await refreshAll(supplierId);
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const duplicateProduct = async (supplierId: string, p: ProductRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productName: `${p.productName} ${t("procurement.copySuffix")}`,
          regularPrice: p.regularPrice,
          unit: p.unit,
          notes: p.notes,
        }),
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      setNotice(t("procurement.noticeSaved"));
      await refreshAll(supplierId);
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async (supplierId: string, productId: string) => {
    if (!window.confirm(t("procurement.confirmDeleteProduct"))) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products/${encodeURIComponent(productId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean };
      if (!res.ok || !j.ok) throw new Error("err");
      setNotice(t("procurement.noticeSaved"));
      await refreshAll(supplierId);
    } catch {
      setNotice(t("procurement.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (supplierId: string, id: string, name: string) => {
    if (historyFor?.id === id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor({ supplierId, id, name });
    try {
      const res = await fetch(
        `/api/procurement/suppliers/${encodeURIComponent(supplierId)}/products/${encodeURIComponent(id)}/history`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean; data?: { price: number; recordedAt: string }[] };
      setHistoryRows(j.ok ? j.data ?? [] : []);
    } catch {
      setHistoryRows([]);
    }
  };

  const categoriesFor = (supplierId: string) => {
    const list = productsBySupplier[supplierId] ?? [];
    const set = new Set<string>();
    for (const p of list) {
      const u = p.unit?.trim();
      if (u) set.add(u);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, bcp47));
  };

  const filterProducts = (list: ProductRow[]) => {
    if (!categoryFilter) return list;
    return list.filter((p) => (p.unit ?? "").trim() === categoryFilter);
  };

  const renderProductCard = (supplierId: string, p: ProductRow) => {
    const isEditing = editingProduct?.id === p.id && editingProduct.supplierId === supplierId;
    const showHistory = historyFor?.id === p.id;

    if (isEditing && editingProduct) {
      return (
        <div key={p.id} className="tcg-fade-in rounded-xl border border-violet-200 bg-white p-3 ring-1 ring-violet-100">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputClass}
              value={editingProduct.name}
              onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
              placeholder={t("procurement.colProduct")}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={editingProduct.regularPrice}
              onChange={(e) => setEditingProduct({ ...editingProduct, regularPrice: e.target.value })}
              placeholder={t("procurement.fieldRegularPrice")}
            />
            <input
              className={inputClass}
              value={editingProduct.unit}
              onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
              placeholder={t("procurement.fieldCategory")}
            />
            <input
              className={inputClass}
              value={editingProduct.notes}
              onChange={(e) => setEditingProduct({ ...editingProduct, notes: e.target.value })}
              placeholder={t("procurement.fieldOcrNote")}
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="text-xs font-bold text-slate-600" onClick={() => setEditingProduct(null)}>
              {t("procurement.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white"
              onClick={() => void saveProduct(supplierId, true)}
            >
              {t("procurement.save")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <article
        key={p.id}
        className={`rounded-xl border p-3 shadow-sm ring-1 transition hover:shadow-md ${priceBorderClass(p)}`}
      >
        <p className="text-sm font-semibold text-slate-900">{p.productName}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <span className="text-slate-500">{t("procurement.colRegular")}</span>
          <span className="text-end font-semibold tabular-nums text-slate-800">{formatShekel(p.regularPrice)}</span>
          <span className="text-slate-500">{t("procurement.colLast")}</span>
          <span className="text-end font-semibold tabular-nums text-slate-800">{formatShekel(p.lastPrice)}</span>
          <span className="text-slate-500">{t("procurement.colChange")}</span>
          <span
            className={`text-end font-semibold tabular-nums ${
              p.changePct > 0.5 ? "text-rose-700" : p.changePct < -0.5 ? "text-emerald-700" : "text-slate-600"
            }`}
          >
            {p.changePct > 0 ? "+" : ""}
            {p.changePct.toFixed(1)}%
          </span>
          <span className="text-slate-500">{t("procurement.colUpdated")}</span>
          <span className="text-end text-slate-600">{fmtDate(p.lastRecordedAt ?? p.updatedAt)}</span>
        </div>
        {p.unit ? (
          <p className="mt-1.5 text-[11px] font-medium text-slate-500">
            {t("procurement.fieldCategory")}: {p.unit}
          </p>
        ) : null}
        {p.notes ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
            <span className="font-medium text-slate-600">{t("procurement.fieldOcrNote")}:</span> {p.notes}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1 border-t border-slate-100/80 pt-2">
          <button type="button" title={t("procurement.editProduct")} className={iconBtn} disabled={busy} onClick={() =>
            setEditingProduct({
              supplierId,
              id: p.id,
              name: p.productName,
              regularPrice: String(p.regularPrice),
              unit: p.unit ?? "",
              notes: p.notes ?? "",
            })
          }>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" title={t("procurement.history")} className={iconBtn} disabled={busy} onClick={() => void openHistory(supplierId, p.id, p.productName)}>
            <History className="h-3.5 w-3.5" />
          </button>
          <button type="button" title={t("procurement.duplicateProduct")} className={iconBtn} disabled={busy} onClick={() => void duplicateProduct(supplierId, p)}>
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" title={t("procurement.delete")} className={`${iconBtn} hover:text-rose-700`} disabled={busy} onClick={() => void deleteProduct(supplierId, p.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {showHistory ? (
          <div className="tcg-fade-in mt-2 rounded-lg bg-slate-50 p-2 text-[11px]">
            <p className="font-bold text-slate-700">{t("procurement.historyTitle")}</p>
            {historyRows.length === 0 ? (
              <p className="mt-1 text-slate-500">—</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {historyRows.map((h, i) => (
                  <li key={`${h.recordedAt}-${i}`} className="flex justify-between gap-2 tabular-nums">
                    <span>{fmtDate(h.recordedAt)}</span>
                    <span className="font-semibold">{formatShekel(h.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </article>
    );
  };

  const renderExpandedPanel = (s: SupplierRow) => {
    const products = filterProducts(productsBySupplier[s.id] ?? []);
    const categories = categoriesFor(s.id);
    const loading = loadingProducts === s.id;

    return (
      <div className="tcg-fade-in border-t border-white/40 bg-black/5 px-3 pb-3 pt-2 sm:px-4">
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-white/80 p-2.5 ring-1 ring-white/60">
          <label className="min-w-[10rem] flex-1 text-[11px] font-semibold text-slate-600">
            {t("procurement.filterProduct")}
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={productQ} onChange={(e) => setProductQ(e.target.value)} className={`${inputClass} pe-8`} />
            </div>
          </label>
          <label className="min-w-[8rem] text-[11px] font-semibold text-slate-600">
            {t("procurement.filterCategory")}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">{t("procurement.allCategories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 pb-1 text-[11px] font-semibold text-slate-700">
            <input type="checkbox" checked={onlyDeviations} onChange={(e) => setOnlyDeviations(e.target.checked)} />
            {t("procurement.filterDeviations")}
          </label>
        </div>

        {addProductFor === s.id ? (
          <div className="tcg-fade-in mb-3 rounded-xl border border-dashed border-violet-300 bg-white/90 p-3">
            <p className="text-xs font-black text-violet-900">{t("procurement.addProduct")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                className={inputClass}
                value={newProduct.name}
                onChange={(e) => setNewProduct((x) => ({ ...x, name: e.target.value }))}
                placeholder={t("procurement.colProduct")}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={newProduct.regularPrice}
                onChange={(e) => setNewProduct((x) => ({ ...x, regularPrice: e.target.value }))}
                placeholder={t("procurement.fieldRegularPrice")}
              />
              <input
                className={inputClass}
                value={newProduct.unit}
                onChange={(e) => setNewProduct((x) => ({ ...x, unit: e.target.value }))}
                placeholder={t("procurement.fieldCategory")}
              />
              <input
                className={inputClass}
                value={newProduct.notes}
                onChange={(e) => setNewProduct((x) => ({ ...x, notes: e.target.value }))}
                placeholder={t("procurement.fieldOcrNote")}
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="text-xs font-bold text-slate-600" onClick={() => setAddProductFor(null)}>
                {t("procurement.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white"
                onClick={() => void saveProduct(s.id, false)}
              >
                {t("procurement.save")}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm font-medium text-slate-600">{t("common.loading")}</p>
        ) : products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/60 py-6 text-center text-sm text-slate-600">
            {t("procurement.noProducts")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{products.map((p) => renderProductCard(s.id, p))}</div>
        )}
      </div>
    );
  };

  return (
    <div dir={dir} className="mx-auto max-w-6xl space-y-4 pb-10">
      <header className="rounded-2xl bg-gradient-to-br from-violet-100 via-white to-cyan-50 p-5 shadow-sm ring-1 ring-violet-100/80 md:p-6">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-violet-800">
          <Truck className="h-4 w-4" aria-hidden />
          {t("nav.sectionFinance")}
        </p>
        <h1 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{t("procurement.pageTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{t("procurement.pageSubtitle")}</p>
        {notice ? <p className="mt-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
        {loadError ? (
          <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
            {loadError}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={supplierQ}
            onChange={(e) => setSupplierQ(e.target.value)}
            className={`${inputClass} pe-10`}
            placeholder={t("procurement.searchSupplier")}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddSupplier((v) => !v);
            setEditingSupplierId(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-violet-800"
        >
          <Plus className="h-4 w-4" />
          {t("procurement.addSupplier")}
        </button>
      </div>

      {showAddSupplier ? (
        <div className="tcg-fade-in rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">{t("procurement.modalSupplierTitle")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className={inputClass}
              value={newSupplier.name}
              onChange={(e) => setNewSupplier((x) => ({ ...x, name: e.target.value }))}
              placeholder={`${t("procurement.fieldName")} *`}
            />
            <input
              className={inputClass}
              value={newSupplier.phone}
              onChange={(e) => setNewSupplier((x) => ({ ...x, phone: e.target.value }))}
              placeholder={t("procurement.fieldPhone")}
            />
            <input
              className={inputClass}
              value={newSupplier.email}
              onChange={(e) => setNewSupplier((x) => ({ ...x, email: e.target.value }))}
              placeholder={t("procurement.fieldEmail")}
            />
            <input
              className={inputClass}
              value={newSupplier.notes}
              onChange={(e) => setNewSupplier((x) => ({ ...x, notes: e.target.value }))}
              placeholder={t("procurement.fieldNotes")}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-sm font-bold text-slate-600" onClick={() => setShowAddSupplier(false)}>
              {t("procurement.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              onClick={() => void saveSupplier(false)}
            >
              {t("procurement.save")}
            </button>
          </div>
        </div>
      ) : null}

      {suppliers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          {t("procurement.noSuppliers")}
        </p>
      ) : (
        <ul className="grid gap-4">
          {suppliers.map((s, idx) => {
            const grad = SUPPLIER_GRADIENTS[idx % SUPPLIER_GRADIENTS.length];
            const expanded = expandedId === s.id;
            const isEditing = editingSupplierId === s.id;

            return (
              <li
                key={s.id}
                className={`tcg-card overflow-hidden rounded-2xl shadow-md ring-1 transition duration-200 ${
                  expanded ? "ring-violet-300/80" : "ring-white/60 hover:shadow-lg"
                }`}
                style={{ background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)` }}
              >
                {isEditing ? (
                  <div className="bg-white/90 p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className={inputClass} value={editSupplier.name} onChange={(e) => setEditSupplier((x) => ({ ...x, name: e.target.value }))} />
                      <input className={inputClass} value={editSupplier.phone} onChange={(e) => setEditSupplier((x) => ({ ...x, phone: e.target.value }))} />
                      <input className={inputClass} value={editSupplier.email} onChange={(e) => setEditSupplier((x) => ({ ...x, email: e.target.value }))} />
                      <input className={inputClass} value={editSupplier.notes} onChange={(e) => setEditSupplier((x) => ({ ...x, notes: e.target.value }))} />
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" className="text-xs font-bold text-slate-600" onClick={() => setEditingSupplierId(null)}>
                        {t("procurement.cancel")}
                      </button>
                      <button type="button" disabled={busy} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white" onClick={() => void saveSupplier(true, s.id)}>
                        {t("procurement.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={() => toggleExpand(s.id)}
                        className="flex min-w-0 flex-1 flex-col text-start"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-900 sm:text-lg">{s.name}</h2>
                            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-700/90">
                              <Phone className="h-3 w-3 shrink-0" aria-hidden />
                              {s.phone ?? "—"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {s.productCount > 0 ? (
                              <span className="rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                {t("procurement.ocrReady")}
                              </span>
                            ) : null}
                            <span className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-800 ring-1 ring-white/80">
                              {t("procurement.productCount", { count: s.productCount })}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-600/90">
                          {t("procurement.lastUpdated")}: {fmtDate(s.updatedAt)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleExpand(s.id)}
                        className="mt-1 rounded-lg bg-white/60 p-1.5 text-slate-800"
                        aria-expanded={expanded}
                      >
                        <ChevronDown className={`h-5 w-5 transition ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 border-t border-white/30 px-3 pb-3 sm:px-4">
                      <button
                        type="button"
                        title={t("procurement.addProduct")}
                        className={iconBtn}
                        disabled={busy}
                        onClick={() => {
                          setExpandedId(s.id);
                          setAddProductFor(s.id);
                          setNewProduct({ name: "", regularPrice: "", unit: "", notes: "" });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t("procurement.editSupplier")}
                        className={iconBtn}
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            setEditingSupplierId(s.id);
                            setEditSupplier({
                              name: s.name,
                              phone: s.phone ?? "",
                              email: s.email ?? "",
                              notes: "",
                            });
                            try {
                              const r = await fetch(`/api/procurement/suppliers/${encodeURIComponent(s.id)}`, {
                                credentials: "same-origin",
                              });
                              const dj = (await r.json()) as { ok?: boolean; data?: { notes?: string | null; email?: string | null } };
                              if (dj.ok && dj.data) {
                                setEditSupplier((x) => ({
                                  ...x,
                                  email: dj.data?.email ?? x.email,
                                  notes: dj.data?.notes ?? "",
                                }));
                              }
                            } catch {
                              /* keep partial */
                            }
                          })();
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title={t("procurement.duplicateSupplier")} className={iconBtn} disabled={busy} onClick={() => void duplicateSupplier(s)}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title={t("procurement.delete")} className={`${iconBtn} hover:text-rose-700`} disabled={busy} onClick={() => void deleteSupplier(s.id, s.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
                {expanded && !isEditing ? renderExpandedPanel(s) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
