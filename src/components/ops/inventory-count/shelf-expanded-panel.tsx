"use client";

import { ChevronDown, Search } from "lucide-react";
import { ProductCountCard } from "./product-count-card";
import type { ListMeta, MonthlyCountRow } from "./types";

type SheetStats = {
  total: number;
  match: number;
  short: number;
  surplus: number;
  filled: number;
};

type Props = {
  shelfName: string;
  countingMode: boolean;
  monthlyRows: MonthlyCountRow[];
  countDate: string;
  onCountDate: (v: string) => void;
  countQ: string;
  onCountQ: (v: string) => void;
  onAddProduct: () => void;
  onCollapse: () => void;
  actualById: Record<string, string>;
  setActualById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  bumpQty: (id: string, prev: number, delta: number) => void;
  countMeta: ListMeta | null;
  countPage: number;
  setCountPage: React.Dispatch<React.SetStateAction<number>>;
  sheetStats: SheetStats;
  saveMonthly: () => void | Promise<void>;
  busy: boolean;
  tD: (key: string, vars?: Record<string, string | number>) => string;
  dateLabel: string;
  addProductLabel: string;
  prevLabel: string;
  nextLabel: string;
};

export function ShelfExpandedPanel({
  shelfName,
  countingMode,
  monthlyRows,
  countDate,
  onCountDate,
  countQ,
  onCountQ,
  onAddProduct,
  onCollapse,
  actualById,
  setActualById,
  bumpQty,
  countMeta,
  countPage,
  setCountPage,
  sheetStats,
  saveMonthly,
  busy,
  tD,
  dateLabel,
  addProductLabel,
  prevLabel,
  nextLabel,
}: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-sky-200/80 bg-white shadow-lg ring-1 ring-sky-100/60 motion-safe:animate-[cashflowFilterIn_0.25s_ease-out]">
      <div className="border-b border-slate-100 bg-gradient-to-l from-sky-50/50 via-white to-slate-50/30 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {tD("productsTitle", { shelf: shelfName })}
            </h3>
            {countingMode ? (
              <p className="mt-1 text-xs font-semibold text-sky-800">{tD("countingHint")}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
            {tD("collapseShelf")}
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="text-xs font-bold text-slate-600">
            {dateLabel}
            <input
              type="date"
              value={countDate}
              onChange={(e) => onCountDate(e.target.value)}
              className="mt-1 block w-full max-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={countQ}
              onChange={(e) => onCountQ(e.target.value)}
              placeholder={tD("searchPlaceholder")}
              className="w-full rounded-xl border border-slate-200 py-2.5 pe-10 ps-3 text-sm font-medium outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <button
            type="button"
            onClick={onAddProduct}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {addProductLabel}
          </button>
        </div>
      </div>

      {monthlyRows.length === 0 ? (
        <p className="p-8 text-center text-sm font-semibold text-slate-500">{tD("emptyShelf")}</p>
      ) : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monthlyRows.map((row) => {
              const displayQty = row.raw !== "" ? row.raw : String(row.previousQuantity);
              return (
                <ProductCountCard
                  key={row.id}
                  row={row}
                  displayQty={displayQty}
                  countingMode={countingMode}
                  onQtyChange={(v) => setActualById((p) => ({ ...p, [row.id]: v }))}
                  onBump={(d) => bumpQty(row.id, row.previousQuantity, d)}
                />
              );
            })}
          </div>

          {countMeta && countMeta.total > countMeta.pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                disabled={countPage <= 1}
                onClick={() => setCountPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40"
              >
                {prevLabel}
              </button>
              <button
                type="button"
                disabled={countPage >= Math.ceil(countMeta.total / countMeta.pageSize)}
                onClick={() => setCountPage((p) => p + 1)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40"
              >
                {nextLabel}
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-4 border-t border-slate-100 bg-gradient-to-l from-emerald-50/40 to-white p-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-700">
              <span>{tD("footerTotal", { n: sheetStats.total })}</span>
              <span className="text-emerald-700">{tD("footerMatch", { n: sheetStats.match })}</span>
              <span className="text-rose-700">{tD("footerShort", { n: sheetStats.short })}</span>
              <span className="text-amber-700">{tD("footerSurplus", { n: sheetStats.surplus })}</span>
            </div>
            <button
              type="button"
              disabled={busy || sheetStats.filled === 0}
              onClick={() => void saveMonthly()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-900/15 transition hover:brightness-110 disabled:opacity-50 md:w-auto"
            >
              💾 {tD("saveShelf")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
