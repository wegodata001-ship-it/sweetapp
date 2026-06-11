"use client";

import { memo } from "react";
import { AlertTriangle, Loader2, Minus, Package, Plus } from "lucide-react";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
} from "@/components/ops/inventory-count/count-product-status";

export type ShelfCountLineRowProps = {
  id: string;
  name: string;
  barcode: string;
  unit: string | null;
  systemQty: number;
  minimumQuantity: number;
  actualRaw: string;
  saving?: boolean;
  onActualChange: (value: string) => void;
  onBump: (delta: number) => void;
  t: (key: string) => string;
};

function ShelfCountLineRowInner({
  name,
  barcode,
  unit,
  systemQty,
  minimumQuantity,
  actualRaw,
  saving,
  onActualChange,
  onBump,
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
      : systemQty < minimumQuantity
        ? "below"
        : systemQty <= minimumQuantity * 1.2
          ? "near"
          : "ok";
  const minimumClasses =
    minimumStatus === "below"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : minimumStatus === "near"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const diffLabel =
    diff === null
      ? "—"
      : diff === 0
        ? "0"
        : diff > 0
          ? `+${diff}`
          : String(diff);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-2xl border px-2.5 py-2 transition-shadow duration-200 sm:flex-nowrap sm:gap-2 sm:px-3 ${st.row}`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5] sm:h-9 sm:w-9">
        <Package className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="min-w-[8rem] flex-[1_1_10rem] text-end">
        <p className="line-clamp-2 break-words text-sm font-black leading-tight text-slate-900 sm:text-[13px]">
          {name}
        </p>
        <p className="truncate text-[10px] font-semibold tabular-nums text-slate-500">
          {barcode}
          {unit ? ` · ${unit}` : ""}
        </p>
      </div>

      <div className="grid w-full grid-cols-4 gap-1.5 text-center text-[10px] font-bold sm:w-auto sm:min-w-[14rem] sm:grid-cols-4">
        <div className="rounded-xl bg-white/90 px-1.5 py-1 ring-1 ring-[#e7ecf5]">
          <span className="text-slate-500">{t("inSystem")}</span>
          <p className="text-sm font-black tabular-nums text-slate-800">{systemQty}</p>
        </div>
        <div className={`rounded-xl border px-1.5 py-1 ${minimumClasses}`}>
          <span>{t("minimum")}</span>
          <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
        </div>
        <div className="rounded-xl bg-white/90 px-1.5 py-1 ring-1 ring-[#e7ecf5]">
          <span className="text-slate-500">{t("actual")}</span>
          <input
            type="number"
            inputMode="decimal"
            value={actualRaw}
            onChange={(e) => onActualChange(e.target.value)}
            className="w-full border-0 bg-transparent text-center text-sm font-black tabular-nums text-slate-900 outline-none"
            placeholder="—"
          />
        </div>
        <div className="rounded-xl bg-white/90 px-1.5 py-1 ring-1 ring-[#e7ecf5]">
          <span className="text-slate-500">{t("diff")}</span>
          <p
            className={`text-sm font-black tabular-nums ${
              diff === null
                ? "text-slate-400"
                : diff < 0
                  ? "text-rose-600"
                  : diff > 0
                    ? "text-amber-600"
                    : "text-emerald-600"
            }`}
          >
            {diffLabel}
          </p>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onBump(-1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-[#f6f8fc] active:scale-95"
            aria-label="-1"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onBump(1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-[#f6f8fc] active:scale-95"
            aria-label="+1"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {minimumStatus === "below" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t("minimumWarning")}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-700 ring-1 ring-[#e7ecf5]">
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
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
