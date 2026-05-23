"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Package, Play } from "lucide-react";
import {
  ShelfCardActionsMenu,
  type ShelfCardMenuAction,
} from "./shelf-card-actions-menu";

export type ShelfVisualStatus = "perfect" | "shortage" | "errors";

export type ShelfGridModel = {
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchPct: number;
  visualStatus: ShelfVisualStatus;
  locationId?: string | null;
};

export function resolveShelfVisualStatus(s: {
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchPct: number;
}): ShelfVisualStatus {
  if (s.productCount === 0) return "perfect";
  if (s.matchPct >= 100 && s.shortageCount === 0 && s.surplusCount === 0) return "perfect";
  const issues = s.shortageCount + s.surplusCount;
  if (s.matchPct < 70 || issues > Math.max(3, Math.floor(s.productCount * 0.25))) {
    return "errors";
  }
  return "shortage";
}

const statusUi: Record<
  ShelfVisualStatus,
  { card: string; glow: string; labelKey: string; Icon: typeof CheckCircle2 }
> = {
  perfect: {
    card: "border-emerald-200/80 ring-emerald-300/40 hover:shadow-[0_16px_48px_rgba(16,199,132,0.22)]",
    glow: "shadow-[0_0_28px_rgba(16,199,132,0.18)]",
    labelKey: "statusPerfect",
    Icon: CheckCircle2,
  },
  shortage: {
    card: "border-amber-200/90 ring-amber-300/45 hover:shadow-[0_16px_48px_rgba(255,176,32,0.2)]",
    glow: "shadow-[0_0_24px_rgba(255,176,32,0.14)]",
    labelKey: "statusShortage",
    Icon: AlertTriangle,
  },
  errors: {
    card: "border-rose-200/90 ring-rose-300/50 hover:shadow-[0_16px_48px_rgba(255,91,110,0.22)]",
    glow: "shadow-[0_0_28px_rgba(255,91,110,0.2)]",
    labelKey: "statusErrors",
    Icon: AlertTriangle,
  },
};

type Props = {
  shelf: ShelfGridModel;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onOpen: () => void;
  onMenuAction?: (action: ShelfCardMenuAction) => void;
  busy?: boolean;
  exiting?: boolean;
  entering?: boolean;
  canManage?: boolean;
  noPermissionTitle?: string;
};

function ShelfGridCardInner({
  shelf,
  t,
  onOpen,
  onMenuAction,
  busy,
  exiting,
  entering,
  canManage = true,
  noPermissionTitle,
}: Props) {
  const ui = statusUi[shelf.visualStatus];
  const StatusIcon = ui.Icon;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group relative flex cursor-pointer flex-col rounded-[24px] border bg-white p-4 ring-1 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] ${ui.card} ${ui.glow} shadow-[0_8px_32px_rgba(15,23,42,0.06)] ${
        exiting ? "pointer-events-none scale-95 opacity-0" : ""
      } ${entering ? "animate-[shelf-enter_0.35s_ease-out]" : ""} ${busy ? "opacity-80" : ""}`}
    >
      {busy ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-white/60 backdrop-blur-[2px]">
          <Loader2 className="h-7 w-7 animate-spin text-[#6c4cff]" aria-hidden />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f6f8fc] text-[#6c4cff] transition group-hover:scale-105">
          <Package className="h-6 w-6" aria-hidden />
        </div>
        <div className="flex items-center gap-1.5">
          {onMenuAction ? (
            <ShelfCardActionsMenu
              onAction={onMenuAction}
              busy={busy}
              disabled={!canManage}
              disabledTitle={noPermissionTitle}
            />
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-700 ring-1 ring-[#e7ecf5]">
            <StatusIcon className="h-3 w-3" aria-hidden />
            {t(ui.labelKey)}
          </span>
        </div>
      </div>

      <h3 className="mt-3 text-xl font-black leading-tight text-slate-900">{shelf.name}</h3>

      <ul className="mt-3 space-y-1.5 text-sm font-bold text-slate-600">
        <li>{t("metricProducts", { count: shelf.productCount })}</li>
        <li className="text-rose-600">{t("metricShort", { count: shelf.shortageCount })}</li>
        <li className="text-amber-700">{t("metricSurplus", { count: shelf.surplusCount })}</li>
        <li className="text-[#6c4cff]">{t("metricMatch", { pct: shelf.matchPct })}</li>
      </ul>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-[0.99]"
        style={{ background: "linear-gradient(135deg, #6c4cff 0%, #5a3de8 100%)" }}
      >
        <Play className="h-4 w-4 fill-current" aria-hidden />
        {t("startCount")}
      </button>
    </article>
  );
}

export const ShelfGridCard = memo(ShelfGridCardInner);
