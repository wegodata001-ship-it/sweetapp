"use client";

import { memo } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  Package,
  Play,
  Plus,
} from "lucide-react";
import type { ShelfStatusKind } from "@/components/ops/inventory-count/types";
import { formatRelativeTime } from "@/components/ops/inventory-count/utils";

export type ShelfGridModel = {
  name: string;
  productCount: number;
  shortageCount: number;
  countedToday: number;
  progressPct: number;
  lastUpdateIso: string | null;
  status: ShelfStatusKind;
  locationId?: string | null;
};

const statusUi: Record<
  ShelfStatusKind,
  { ring: string; badge: string; labelKey: string; Icon: typeof CheckCircle2 }
> = {
  counted: {
    ring: "ring-[#16c784]/30",
    badge: "bg-[#16c784]/12 text-emerald-800",
    labelKey: "statusCounted",
    Icon: CheckCircle2,
  },
  pending: {
    ring: "ring-[#ffb020]/35",
    badge: "bg-[#ffb020]/15 text-amber-900",
    labelKey: "statusPending",
    Icon: Clock,
  },
  shortage: {
    ring: "ring-[#ff5b6e]/35",
    badge: "bg-[#ff5b6e]/12 text-rose-800",
    labelKey: "statusShortage",
    Icon: AlertTriangle,
  },
  recent: {
    ring: "ring-[#6c4cff]/30",
    badge: "bg-[#6c4cff]/12 text-violet-900",
    labelKey: "statusActive",
    Icon: Layers,
  },
};

type Props = {
  shelf: ShelfGridModel;
  bcp47: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onStartCount: () => void;
  onViewProducts: () => void;
  onMovements?: () => void;
  onEdit?: () => void;
};

function ShelfGridCardInner({
  shelf,
  bcp47,
  t,
  onStartCount,
  onViewProducts,
  onMovements,
  onEdit,
}: Props) {
  const ui = statusUi[shelf.status];
  const StatusIcon = ui.Icon;
  const remaining = Math.max(0, shelf.productCount - shelf.countedToday);
  const pct = Math.min(100, shelf.progressPct);

  return (
    <article
      className={`flex flex-col rounded-[20px] border border-[#e7ecf5] bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.05)] ring-1 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_14px_36px_rgba(108,76,255,0.12)] hover:scale-[1.01] ${ui.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f6f8fc] text-[#6c4cff]">
          <Package className="h-5 w-5" aria-hidden />
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${ui.badge}`}>
          <StatusIcon className="h-3 w-3" aria-hidden />
          {t(ui.labelKey)}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-black leading-tight text-slate-900">{shelf.name}</h3>
      <p className="mt-1 text-sm font-bold text-slate-600">
        {t("productCount", { count: shelf.productCount })}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-slate-500">
        {t("countProgress", { done: shelf.countedToday, left: remaining })}
      </p>

      <div className="mt-3">
        <div className="flex justify-between text-[10px] font-bold text-slate-500">
          <span>{t("progress")}</span>
          <span className="tabular-nums text-[#6c4cff]">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e7ecf5]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#6c4cff] to-[#16c784] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="mt-2 text-[10px] font-medium text-slate-400">
        {t("lastUpdate")}: {formatRelativeTime(shelf.lastUpdateIso, bcp47)}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onViewProducts}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl border border-[#e7ecf5] text-[10px] font-bold text-slate-700 hover:bg-[#f6f8fc]"
        >
          <Package className="h-3 w-3" />
          {t("viewProducts")}
        </button>
        {onMovements ? (
          <button
            type="button"
            onClick={onMovements}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-[#e7ecf5] px-2 text-[10px] font-bold text-slate-700 hover:bg-[#f6f8fc]"
          >
            <BarChart3 className="h-3 w-3" />
          </button>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e7ecf5] text-slate-700 hover:bg-[#f6f8fc]"
            title={t("edit")}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onStartCount}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-[0.99]"
        style={{ background: "linear-gradient(135deg, #6c4cff 0%, #5a3de8 100%)" }}
      >
        <Play className="h-4 w-4 fill-current" aria-hidden />
        {t("startCount")}
      </button>
    </article>
  );
}

export const ShelfGridCard = memo(ShelfGridCardInner);
