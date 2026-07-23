"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type ProductEditValues = {
  id: string;
  nameHe: string;
  nameAr: string;
  nameEn: string;
  barcode: string;
  sku: string;
  unit: string;
};

type Props = {
  open: boolean;
  initial: ProductEditValues | null;
  onClose: () => void;
  onSaved: (product: ProductEditValues & { name: string }) => void;
  t: (key: string) => string;
};

export function ProductEditModal({ open, initial, onClose, onSaved, t }: Props) {
  const [form, setForm] = useState<ProductEditValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initial) return;
    setForm({ ...initial });
    setError(null);
  }, [open, initial]);

  if (!open || !form) return null;

  const save = async () => {
    const nameHe = form.nameHe.trim();
    if (!nameHe) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/count-products/${encodeURIComponent(form.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          nameHe,
          nameAr: form.nameAr.trim() || null,
          nameEn: form.nameEn.trim() || null,
          barcode: form.barcode.trim() || null,
          sku: form.sku.trim() || null,
          unit: form.unit.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onSaved({
        ...form,
        nameHe,
        name: nameHe,
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        barcode: form.barcode.trim(),
        sku: form.sku.trim(),
        unit: form.unit.trim(),
      });
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 h-12 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold outline-none focus:border-[#6c4cff]";

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:rounded-[24px]"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">{t("editProductTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-end">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameHe")}</span>
            <input
              value={form.nameHe}
              onChange={(e) => setForm((f) => (f ? { ...f, nameHe: e.target.value } : f))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameAr")}</span>
            <input
              value={form.nameAr}
              onChange={(e) => setForm((f) => (f ? { ...f, nameAr: e.target.value } : f))}
              className={inputClass}
              dir="rtl"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameEn")}</span>
            <input
              value={form.nameEn}
              onChange={(e) => setForm((f) => (f ? { ...f, nameEn: e.target.value } : f))}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("barcode")}</span>
            <input
              value={form.barcode}
              onChange={(e) => setForm((f) => (f ? { ...f, barcode: e.target.value } : f))}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("sku")}</span>
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => (f ? { ...f, sku: e.target.value } : f))}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("unit")}</span>
            <input
              value={form.unit}
              onChange={(e) => setForm((f) => (f ? { ...f, unit: e.target.value } : f))}
              className={inputClass}
            />
          </label>
          {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-2xl border border-slate-200 text-sm font-black"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-12 rounded-2xl bg-[#6c4cff] text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "…" : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
