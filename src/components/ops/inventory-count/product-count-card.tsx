"use client";

import { Minus, Package, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { MonthlyCountRow } from "./types";
import { countDiffMeta } from "./utils";

type Props = {
  row: MonthlyCountRow;
  displayQty: string;
  onQtyChange: (value: string) => void;
  onBump: (delta: number) => void;
  countingMode: boolean;
};

export function ProductCountCard({ row, displayQty, onQtyChange, onBump, countingMode }: Props) {
  const { t } = useI18n();
  const dm = row.diff === null ? null : countDiffMeta(row.diff, t);
  const borderClass =
    dm?.borderClass ??
    "border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 ring-slate-100";

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition-all duration-200 ring-1 ${borderClass} ${
        countingMode ? "hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-100/80 text-sky-700">
          <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-black text-slate-900 leading-snug">{row.name}</h4>
          {row.unit ? (
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{row.unit}</p>
          ) : null}
        </div>
        {dm ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${dm.badgeClass}`}
          >
            {dm.label}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {t("ops.inventory.countDashboard.inSystem")}
          </p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-slate-800">
            {row.previousQuantity}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {t("ops.inventory.countDashboard.actualCount")}
          </p>
          {countingMode ? (
            <div className="mt-1 inline-flex w-full items-center justify-between gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={() => onBump(-1)}
                aria-label="-"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="decimal"
                className="min-w-0 flex-1 border-0 bg-transparent text-center text-lg font-black tabular-nums outline-none"
                value={displayQty}
                onChange={(e) => onQtyChange(e.target.value)}
              />
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={() => onBump(1)}
                aria-label="+"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="mt-0.5 text-lg font-black tabular-nums text-slate-800">{displayQty}</p>
          )}
        </div>
      </div>

      {row.diff !== null ? (
        <p className="mt-3 text-sm font-bold" style={dm?.diffStyle}>
          {t("ops.inventory.countDashboard.diffLabel")}:{" "}
          <span className="tabular-nums">
            {row.diff > 0 ? "+" : ""}
            {row.diff}
          </span>
        </p>
      ) : null}
    </article>
  );
}
