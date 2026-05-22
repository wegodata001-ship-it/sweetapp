"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Package,
  Play,
  Plus,
} from "lucide-react";
import type { ShelfStatusKind, ShelfSummary } from "./types";
import { formatRelativeTime } from "./utils";

const statusStyles: Record<
  ShelfStatusKind,
  { card: string; badge: string; dot: string; labelKey: string; icon: typeof CheckCircle2 }
> = {
  counted: {
    card: "hover:border-emerald-300/80 hover:shadow-[0_12px_40px_rgba(16,185,129,0.12)]",
    badge: "bg-emerald-500/15 text-emerald-800 ring-emerald-300/50",
    dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]",
    labelKey: "badgeCounted",
    icon: CheckCircle2,
  },
  pending: {
    card: "hover:border-violet-300/80 hover:shadow-[0_12px_40px_rgba(139,92,246,0.12)]",
    badge: "bg-violet-500/15 text-violet-900 ring-violet-300/50",
    dot: "bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.45)]",
    labelKey: "badgePending",
    icon: Layers,
  },
  shortage: {
    card: "hover:border-rose-300/80 hover:shadow-[0_12px_40px_rgba(244,63,94,0.14)]",
    badge: "bg-rose-500/15 text-rose-800 ring-rose-300/50",
    dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.55)]",
    labelKey: "badgeShortage",
    icon: AlertTriangle,
  },
  recent: {
    card: "hover:border-sky-300/80 hover:shadow-[0_12px_40px_rgba(14,165,233,0.12)]",
    badge: "bg-sky-500/15 text-sky-900 ring-sky-300/50",
    dot: "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.45)]",
    labelKey: "badgeNewUpdate",
    icon: Clock,
  },
};

type Props = {
  shelf: ShelfSummary;
  status: ShelfStatusKind;
  progressPct: number;
  lastUpdateIso: string | null;
  bcp47: string;
  tD: (key: string, vars?: Record<string, string | number>) => string;
  onOpenWorkspace: () => void;
  onHistory: () => void;
  onStats: () => void;
  onAddProduct: () => void;
};

export function WarehouseAreaCard({
  shelf,
  status,
  progressPct,
  lastUpdateIso,
  bcp47,
  tD,
  onOpenWorkspace,
  onHistory,
  onStats,
  onAddProduct,
}: Props) {
  const st = statusStyles[status];
  const StatusIcon = st.icon;
  const pct = Math.min(100, Math.max(0, progressPct));

  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-sky-50/30 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 ${st.card}`}
    >
      <div className="pointer-events-none absolute -top-8 -left-8 h-32 w-32 rounded-full bg-gradient-to-br from-sky-200/30 to-transparent blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-lg ring-2 ring-white/80">
          <MapPin className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black ring-1 ${st.badge}`}
        >
          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
          <StatusIcon className="h-3 w-3" aria-hidden />
          {tD(st.labelKey)}
        </span>
      </div>

      <h4 className="relative mt-4 text-xl font-black tracking-tight text-slate-900">{shelf.name}</h4>
      <p className="relative mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-600">
        <Package className="h-4 w-4 text-sky-600" aria-hidden />
        {tD("productCount", { count: shelf.productCount })}
      </p>

      {shelf.shortageCount > 0 ? (
        <p className="relative mt-2 inline-flex items-center gap-1 text-xs font-black text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {tD("shortageOnShelf", { n: shelf.shortageCount })}
        </p>
      ) : null}

      <div className="relative mt-4">
        <div className="flex justify-between text-[10px] font-bold text-slate-500">
          <span>{tD("areaProgress")}</span>
          <span className="tabular-nums text-sky-800">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="relative mt-3 text-[11px] font-medium text-slate-500">
        {tD("lastUpdate")}: {formatRelativeTime(lastUpdateIso, bcp47)}
      </p>

      <div className="relative mt-4 flex gap-1.5">
        <button
          type="button"
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 text-[11px] font-bold text-slate-700 transition hover:bg-sky-50"
          onClick={onHistory}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{tD("actionHistory")}</span>
        </button>
        <button
          type="button"
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 text-[11px] font-bold text-slate-700 transition hover:bg-sky-50"
          onClick={onStats}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{tD("actionStats")}</span>
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 text-slate-700 transition hover:bg-sky-50"
          onClick={onAddProduct}
          title={tD("actionAdd")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenWorkspace}
        className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 py-3.5 text-sm font-black text-white shadow-lg shadow-slate-900/25 transition hover:brightness-110 active:scale-[0.99]"
      >
        <Play className="h-4 w-4 fill-current" />
        {tD("openWorkspace")}
      </button>
    </article>
  );
}
