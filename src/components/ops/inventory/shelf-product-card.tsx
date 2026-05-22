"use client";

import { memo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Package, TrendingUp } from "lucide-react";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
} from "@/components/ops/inventory-count/count-product-status";
import type { InventoryCountProductRow } from "@/components/ops/inventory-count/types";

type LastCount = {
  createdAt: string;
  currentQuantity: number;
  countedBy: string | null;
};

type Props = {
  row: InventoryCountProductRow;
  actualRaw: string;
  onActualChange: (value: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onFetchLastCount: (productId: string) => Promise<LastCount | null>;
};

function ShelfProductCardInner({ row, actualRaw, onActualChange, t, onFetchLastCount }: Props) {
  const [lastOpen, setLastOpen] = useState(false);
  const [last, setLast] = useState<LastCount | null>(null);
  const [lastLoading, setLastLoading] = useState(false);

  const actual = actualRaw === "" ? null : Number(actualRaw);
  const diff = actual === null || Number.isNaN(actual) ? null : actual - row.previousQuantity;
  const status = resolveCountLineStatus(actual, row.previousQuantity);
  const st = countStatusStyles(status);

  const openLast = async () => {
    if (lastOpen) {
      setLastOpen(false);
      return;
    }
    setLastLoading(true);
    setLastOpen(true);
    const data = await onFetchLastCount(row.id);
    setLast(data);
    setLastLoading(false);
  };

  return (
    <article
      className={`relative rounded-[20px] border p-3 transition-all duration-200 ${st.row}`}
    >
      <div className="flex gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5]">
          <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 text-end">
          <h4 className="font-black text-slate-900">{row.name}</h4>
          {row.unit ? (
            <p className="text-[10px] font-semibold text-slate-500">{row.unit}</p>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold">
            <div className="rounded-xl bg-white/90 px-2 py-1.5 ring-1 ring-[#e7ecf5]">
              <span className="text-[10px] text-slate-500">{t("inSystem")}</span>
              <p className="text-lg font-black tabular-nums text-slate-800">{row.previousQuantity}</p>
            </div>
            <div className="rounded-xl bg-white/90 px-2 py-1.5 ring-1 ring-[#e7ecf5]">
              <span className="text-[10px] text-slate-500">{t("actual")}</span>
              <input
                type="number"
                inputMode="decimal"
                value={actualRaw}
                onChange={(e) => onActualChange(e.target.value)}
                className="mt-0.5 w-full border-0 bg-transparent text-center text-lg font-black tabular-nums text-slate-900 outline-none focus:ring-0"
                placeholder="—"
              />
            </div>
          </div>
          {diff !== null ? (
            <p
              className={`mt-2 flex items-center justify-end gap-1 text-sm font-black tabular-nums ${
                diff < 0 ? "text-[#ff5b6e]" : diff > 0 ? "text-[#ffb020]" : "text-[#16c784]"
              }`}
            >
              {diff < 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : diff > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {diff > 0 ? "+" : ""}
              {diff}
            </p>
          ) : null}
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${st.row.includes("emerald") ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : st.row.includes("rose") ? "bg-rose-50 text-rose-800 ring-rose-200" : st.row.includes("amber") ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-violet-50 text-violet-800 ring-violet-200"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {countStatusLabel(status, t)}
          </span>
        </div>
      </div>

      <div className="relative mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void openLast()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-white/80"
        >
          <Clock className="h-3 w-3" />
          {t("lastCount")}
        </button>
        {lastOpen ? (
          <div className="absolute bottom-full z-20 mb-1 min-w-[180px] rounded-xl border border-[#e7ecf5] bg-white p-3 text-end text-[11px] font-semibold text-slate-600 shadow-lg">
            {lastLoading ? (
              <span>{t("loading")}</span>
            ) : last ? (
              <>
                <p>{new Date(last.createdAt).toLocaleString()}</p>
                <p className="mt-1 tabular-nums">
                  {t("qty")}: {last.currentQuantity}
                </p>
                {last.countedBy ? <p className="mt-0.5 text-slate-500">{last.countedBy}</p> : null}
              </>
            ) : (
              <span>{t("noHistory")}</span>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const ShelfProductCard = memo(ShelfProductCardInner);
