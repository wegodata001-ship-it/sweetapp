"use client";

import { BarChart3, Clock, Package, Plus } from "lucide-react";
import type { ShelfStatusKind, ShelfSummary } from "./types";
import { formatRelativeTime } from "./utils";

const statusStyles: Record<
  ShelfStatusKind,
  { badge: string; dot: string; labelKey: string }
> = {
  counted: {
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
    labelKey: "badgeCounted",
  },
  pending: {
    badge: "bg-amber-50 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
    labelKey: "badgePending",
  },
  shortage: {
    badge: "bg-rose-50 text-rose-800 ring-rose-200",
    dot: "bg-rose-500",
    labelKey: "badgeShortage",
  },
  recent: {
    badge: "bg-sky-50 text-sky-900 ring-sky-200",
    dot: "bg-sky-500",
    labelKey: "badgeNewUpdate",
  },
};

type Props = {
  shelf: ShelfSummary;
  status: ShelfStatusKind;
  isActive: boolean;
  lastUpdateIso: string | null;
  bcp47: string;
  tD: (key: string, vars?: Record<string, string | number>) => string;
  onStartCount: () => void;
  onHistory: () => void;
  onStats: () => void;
  onAddProduct: () => void;
};

export function ShelfCard({
  shelf,
  status,
  isActive,
  lastUpdateIso,
  bcp47,
  tD,
  onStartCount,
  onHistory,
  onStats,
  onAddProduct,
}: Props) {
  const st = statusStyles[status];
  const secondaryBtn =
    "inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200/90 bg-white text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/80";

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${
        isActive
          ? "border-sky-400 ring-2 ring-sky-200/70 shadow-sky-100/50"
          : "border-slate-200/90 hover:border-sky-200/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-100 text-2xl shadow-inner ring-1 ring-white/90">
          📦
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${st.badge}`}
        >
          <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
          {tD(st.labelKey)}
        </span>
      </div>

      <h4 className="mt-3 text-lg font-black text-slate-900">{shelf.name}</h4>
      <p className="mt-1 text-sm font-semibold text-slate-600">
        {tD("productCount", { count: shelf.productCount })}
      </p>
      {shelf.shortageCount > 0 ? (
        <p className="mt-1 text-xs font-bold text-rose-600">
          {tD("shortageOnShelf", { n: shelf.shortageCount })}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] font-medium text-slate-500">
        {tD("lastUpdate")}: {formatRelativeTime(lastUpdateIso, bcp47)}
      </p>

      <div className="mt-3 flex gap-1.5">
        <button type="button" className={secondaryBtn} onClick={onHistory} title={tD("actionHistory")}>
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{tD("actionHistory")}</span>
        </button>
        <button type="button" className={secondaryBtn} onClick={onStats} title={tD("actionStats")}>
          <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{tD("actionStats")}</span>
        </button>
        <button type="button" className={secondaryBtn} onClick={onAddProduct} title={tD("actionAdd")}>
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{tD("actionAdd")}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onStartCount}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 py-3 text-sm font-black text-white shadow-md shadow-sky-900/20 transition hover:brightness-110 active:scale-[0.99]"
      >
        <Package className="h-4 w-4" aria-hidden />
        {tD("startCount")}
      </button>
    </article>
  );
}
