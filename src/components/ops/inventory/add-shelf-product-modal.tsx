"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  shelfName: string;
  locationId: string;
  onClose: () => void;
  onCreated: (product: {
    id: string;
    name: string;
    location: string;
    unit: string | null;
    previousQuantity: number;
    minimumQuantity: number;
    lastCountedAt: string | null;
  }) => void;
  t: (key: string) => string;
};

/**
 * יצירת מוצר בסיסית (legacy modal) — אותם שדות כמו טופס ההוספה המלא.
 * עובדים מנוהלים רק דרך InventoryLocationWorker.
 */
export function AddShelfProductModal({
  open,
  shelfName,
  locationId,
  onClose,
  onCreated,
  t,
}: Props) {
  const [nameHe, setNameHe] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("0");
  const [maximumQuantity, setMaximumQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const inputClass =
    "mt-1 h-12 w-full rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] px-3 text-sm font-semibold outline-none focus:border-[#6c4cff]";

  const submit = async () => {
    const trimmed = nameHe.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    const min = Number(minimumQuantity);
    if (!Number.isFinite(min) || min < 0) {
      setError(t("invalidMinimum"));
      return;
    }
    const maxRaw = maximumQuantity.trim();
    const max = maxRaw === "" ? null : Number(maxRaw);
    if (max !== null && (!Number.isFinite(max) || max < 0)) {
      setError(t("invalidMaximum"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/count-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: trimmed,
          nameHe: trimmed,
          nameAr: nameAr.trim() || null,
          nameEn: nameEn.trim() || null,
          barcode: barcode.trim() || null,
          sku: sku.trim() || null,
          locationId,
          unit: unit.trim() || null,
          category: "כללי",
          minimumQuantity: min,
          maximumQuantity: max,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { id: string; name: string; unit: string | null };
      };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onCreated({
        id: j.data.id,
        name: j.data.name,
        location: shelfName,
        unit: j.data.unit,
        previousQuantity: 0,
        minimumQuantity: min,
        lastCountedAt: null,
      });
      setNameHe("");
      setNameAr("");
      setNameEn("");
      setBarcode("");
      setSku("");
      setUnit("");
      setMinimumQuantity("0");
      setMaximumQuantity("");
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border border-[#e7ecf5] bg-white p-5 shadow-2xl sm:rounded-[24px]"
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-end">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameHe")}</span>
            <input
              value={nameHe}
              onChange={(e) => setNameHe(e.target.value)}
              className={inputClass}
              dir="rtl"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameAr")}</span>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputClass}
              dir="rtl"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("nameEn")}</span>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("barcode")}</span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("sku")}</span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("minimum")}</span>
            <input
              type="number"
              value={minimumQuantity}
              onChange={(e) => setMinimumQuantity(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("maximum")}</span>
            <input
              type="number"
              value={maximumQuantity}
              onChange={(e) => setMaximumQuantity(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("unit")}</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={inputClass}
            />
          </label>
          {error ? <p className="text-sm font-bold text-[#ff5b6e]">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-5 w-full rounded-2xl py-3 text-sm font-black text-white disabled:opacity-60"
          style={{ background: "#6c4cff" }}
        >
          {busy ? "…" : t("save")}
        </button>
      </div>
    </div>
  );
}
