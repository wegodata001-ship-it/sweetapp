"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, Plus, Search, X } from "lucide-react";
import type { ProductTransferMode } from "@/lib/inventory/product-transfer-client";
import { transferProduct } from "@/lib/inventory/product-transfer-client";

type LocOption = { id: string; name: string };

type Props = {
  open: boolean;
  mode: ProductTransferMode;
  product: { id: string; name: string } | null;
  sourceName: string;
  sourceLocationId: string | null;
  locations: LocOption[];
  onClose: () => void;
  onSuccess: (result: Awaited<ReturnType<typeof transferProduct>>) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function ProductTransferModal({
  open,
  mode,
  product,
  sourceName,
  sourceLocationId,
  locations,
  onClose,
  onSuccess,
  t,
}: Props) {
  const [targetId, setTargetId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTargetId("");
    setSearch("");
  }, [open, product?.id, mode]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations
      .filter((l) => l.id !== sourceLocationId)
      .filter((l) => !q || l.name.toLowerCase().includes(q));
  }, [locations, sourceLocationId, search]);

  if (!open || !product) return null;

  const selected = locations.find((l) => l.id === targetId);

  const submit = async () => {
    if (!targetId || !selected) {
      setError(t("targetRequired"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await transferProduct({
        mode,
        sourceLocationId,
        sourceName,
        targetLocationId: targetId,
        targetName: selected.name,
        productId: product.id,
      });
      onSuccess(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const isMove = mode === "move";
  const Icon = isMove ? ArrowRightLeft : Plus;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-transfer-title"
    >
      <div
        className="w-full max-w-md rounded-t-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl sm:rounded-[20px]"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                isMove ? "bg-violet-100 text-[#6c4cff]" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 id="product-transfer-title" className="text-lg font-black text-slate-900">
              {isMove ? t("moveTitle") : t("addTitle")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-slate-100"
            aria-label={t("cancel")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2 text-end text-sm">
          <p className="font-bold text-slate-600">
            {t("productLabel")}:{" "}
            <span className="font-black text-slate-900">{product.name}</span>
          </p>
          <p className="font-bold text-slate-600">
            {t("currentLocation")}:{" "}
            <span className="font-black text-slate-900">{sourceName}</span>
          </p>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-bold text-slate-600">{t("target")}</span>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-[#e7ecf5] py-2 text-sm font-semibold outline-none focus:border-[#6c4cff] ltr:pl-9 ltr:pr-3 rtl:pl-3 rtl:pr-9"
              disabled={busy}
            />
          </div>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
            disabled={busy}
          >
            <option value="">{t("targetPlaceholder")}</option>
            {options.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-2 text-[11px] font-medium text-slate-500">
          {isMove ? t("moveHint") : t("addHint")}
        </p>

        {error ? <p className="mt-2 text-sm font-bold text-rose-600">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-600"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white disabled:opacity-60"
            style={{ background: isMove ? "#6c4cff" : "#059669" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? t("busy") : isMove ? t("moveConfirm") : t("addConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
