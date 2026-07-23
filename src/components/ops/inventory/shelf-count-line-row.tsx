"use client";

import { memo, type ReactNode } from "react";
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
  /** כמות במיקום הנוכחי (רשומה במערכת) */
  systemQty: number;
  /** סה״כ בכל המערכת */
  systemTotalQuantity: number;
  systemShortage: number;
  minimumQuantity: number;
  worker1Name: string | null;
  worker1Location: string | null;
  worker2Name: string | null;
  worker2Location: string | null;
  worker3Name: string | null;
  worker3Location: string | null;
  actualRaw: string;
  saving?: boolean;
  onActualChange: (value: string) => void;
  onBump: (delta: number) => void;
  t: (key: string) => string;
};

function Cell({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`min-w-[4.5rem] shrink-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5] ${className ?? ""}`}
    >
      <span className="block truncate text-[9px] font-bold text-slate-500">{label}</span>
      <p className={`truncate text-sm font-black tabular-nums text-slate-800 ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function ShelfCountLineRowInner({
  name,
  barcode,
  unit,
  systemQty,
  systemTotalQuantity,
  systemShortage,
  minimumQuantity,
  worker1Name,
  worker1Location,
  worker2Name,
  worker2Location,
  worker3Name,
  worker3Location,
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

  const dash = (v: string | null | undefined) => (v?.trim() ? v.trim() : "—");

  return (
    <div
      className={`flex min-w-max items-center gap-2 rounded-2xl border px-2.5 py-2 transition-shadow duration-200 sm:gap-2 sm:px-3 ${st.row}`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5] sm:h-9 sm:w-9">
        <Package className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="min-w-[9rem] max-w-[12rem] shrink-0 text-end">
        <p className="line-clamp-2 break-words text-sm font-black leading-tight text-slate-900 sm:text-[13px]">
          {name}
        </p>
        <p className="truncate text-[10px] font-semibold tabular-nums text-slate-500">
          {barcode}
          {unit ? ` · ${unit}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-stretch gap-1.5 text-[10px] font-bold">
        <Cell label={t("systemTotal")} value={systemTotalQuantity} />
        <Cell label={t("locationExpected")} value={systemQty} />
        <Cell label={t("worker1")} value={dash(worker1Name)} />
        <Cell label={t("worker1Loc")} value={dash(worker1Location)} />
        <Cell label={t("worker2")} value={dash(worker2Name)} />
        <Cell label={t("worker2Loc")} value={dash(worker2Location)} />
        <Cell label={t("worker3")} value={dash(worker3Name)} />
        <Cell label={t("worker3Loc")} value={dash(worker3Location)} />
        <div className={`min-w-[4.5rem] shrink-0 rounded-xl border px-1.5 py-1 text-center ${minimumClasses}`}>
          <span className="block truncate text-[9px] font-bold">{t("minimum")}</span>
          <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
        </div>
        <div className="min-w-[6.5rem] shrink-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5]">
          <span className="block truncate text-[9px] font-bold text-slate-500">{t("systemShortage")}</span>
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
        <div className="min-w-[4.5rem] shrink-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5]">
          <span className="block truncate text-[9px] font-bold text-slate-500">{t("actual")}</span>
          <input
            type="number"
            inputMode="decimal"
            value={actualRaw}
            onChange={(e) => onActualChange(e.target.value)}
            className="w-full border-0 bg-transparent text-center text-sm font-black tabular-nums text-slate-900 outline-none"
            placeholder="—"
          />
        </div>
        <div className="min-w-[4rem] shrink-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5]">
          <span className="block truncate text-[9px] font-bold text-slate-500">{t("diff")}</span>
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

      <div className="flex shrink-0 items-center gap-1">
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
