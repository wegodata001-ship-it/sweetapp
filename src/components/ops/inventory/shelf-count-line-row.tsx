"use client";

import { memo, type ReactNode } from "react";
import {
  AlertTriangle,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
} from "lucide-react";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
} from "@/components/ops/inventory-count/count-product-status";
import type { LocationWorkerRow } from "@/lib/inventory/location-workers";

export type ShelfCountLineRowProps = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string | null;
  systemQty: number;
  systemTotalQuantity: number;
  systemShortage: number;
  minimumQuantity: number;
  workers: LocationWorkerRow[];
  actualRaw: string;
  saving?: boolean;
  onActualChange: (value: string) => void;
  onBump: (delta: number) => void;
  onEditProduct: () => void;
  t: (key: string) => string;
};

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl bg-white/90 px-2 py-1.5 text-center ring-1 ring-[#e7ecf5]">
      <span className="block truncate text-[10px] font-bold text-slate-500">{label}</span>
      <p className={`truncate text-sm font-black tabular-nums text-slate-800 ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function ShelfCountLineRowInner({
  name,
  barcode,
  sku,
  unit,
  systemQty,
  systemTotalQuantity,
  systemShortage,
  minimumQuantity,
  workers,
  actualRaw,
  saving,
  onActualChange,
  onBump,
  onEditProduct,
  t,
}: ShelfCountLineRowProps) {
  const actual = actualRaw === "" ? null : Number(actualRaw);
  const diff =
    actual === null || Number.isNaN(actual) ? null : actual - systemQty;
  const status = resolveCountLineStatus(actual, systemQty);
  const st = countStatusStyles(status);
  const minimumStatus =
    minimumQuantity <= 0
      ? "ok"
      : systemTotalQuantity < minimumQuantity
        ? "below"
        : systemTotalQuantity <= minimumQuantity * 1.2
          ? "near"
          : "ok";
  const minimumClasses =
    minimumStatus === "below"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : minimumStatus === "near"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const diffLabel =
    diff === null ? "—" : diff === 0 ? "0" : diff > 0 ? `+${diff}` : String(diff);

  const meta = [barcode, sku, unit].filter(Boolean).join(" · ");

  return (
    <div
      className={`rounded-2xl border px-3 py-3 transition-shadow duration-200 sm:px-4 ${st.row}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5]">
          <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 text-end">
          <p className="break-words text-base font-black leading-tight text-slate-900 sm:text-[15px]">
            {name}
          </p>
          {meta ? (
            <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-slate-500">
              {meta}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onEditProduct}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-600"
          aria-label={t("editProduct")}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* Stats — stacked on mobile, wrap on desktop (no horizontal scroll) */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label={t("systemTotal")} value={systemTotalQuantity} />
        <Stat label={t("locationExpected")} value={systemQty} />
        {workers.map((w) => (
          <div key={w.id} className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
            <Stat label={w.name} value={w.name} />
            <Stat label={w.area || `${t("areaOf")} ${w.name}`} value={w.area || "—"} />
          </div>
        ))}
        <div className={`rounded-xl border px-2 py-1.5 text-center ${minimumClasses}`}>
          <span className="block truncate text-[10px] font-bold">{t("minimum")}</span>
          <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
        </div>
        <div className="rounded-xl bg-white/90 px-2 py-1.5 text-center ring-1 ring-[#e7ecf5]">
          <span className="block truncate text-[10px] font-bold text-slate-500">
            {t("systemShortage")}
          </span>
          {systemShortage > 0 ? (
            <div className="space-y-0 text-[10px] font-black leading-tight text-rose-600">
              <p>
                {t("shortageMin")}: {minimumQuantity}
              </p>
              <p>
                {t("shortageHave")}: {systemTotalQuantity}
              </p>
              <p>
                {t("shortageMissing")}: {systemShortage}
              </p>
            </div>
          ) : (
            <p className="text-sm font-black tabular-nums text-emerald-600">0</p>
          )}
        </div>
        <div className="rounded-xl bg-white/90 px-2 py-1.5 text-center ring-1 ring-[#e7ecf5]">
          <span className="block truncate text-[10px] font-bold text-slate-500">{t("actual")}</span>
          <input
            type="number"
            inputMode="decimal"
            value={actualRaw}
            onChange={(e) => onActualChange(e.target.value)}
            className="h-10 w-full border-0 bg-transparent text-center text-lg font-black tabular-nums text-slate-900 outline-none sm:h-auto sm:text-sm"
            placeholder="—"
          />
        </div>
        <Stat
          label={t("diff")}
          value={diffLabel}
          valueClassName={
            diff === null
              ? "text-slate-400"
              : diff < 0
                ? "text-rose-600"
                : diff > 0
                  ? "text-amber-600"
                  : "text-emerald-600"
          }
        />
      </div>

      {/* Actions — bottom of card, large touch targets */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7ecf5]/80 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBump(-1)}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-[#e7ecf5] bg-white text-slate-700 active:scale-95 sm:h-10 sm:w-10"
            aria-label="-1"
          >
            <Minus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onBump(1)}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-[#e7ecf5] bg-white text-slate-700 active:scale-95 sm:h-10 sm:w-10"
            aria-label="+1"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {minimumStatus === "below" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {t("minimumWarning")}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-[#e7ecf5]">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            )}
            {countStatusLabel(status, t)}
          </span>
        </div>
      </div>
    </div>
  );
}

export const ShelfCountLineRow = memo(ShelfCountLineRowInner);
