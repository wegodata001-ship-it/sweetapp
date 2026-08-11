"use client";

import { memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  GripVertical,
  Loader2,
  Play,
} from "lucide-react";
import { ShelfCountProgressRing } from "./shelf-count-progress-ring";
import {
  ShelfCardActionsMenu,
  type ShelfCardMenuAction,
} from "./shelf-card-actions-menu";
import type { CountLifecycleStatus, LocationType } from "@/lib/inventory/location-types";

export type ShelfVisualStatus = "perfect" | "shortage" | "errors";

export type ShelfGridModel = {
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchPct: number;
  visualStatus: ShelfVisualStatus;
  locationId?: string | null;
  code?: string | null;
  description?: string | null;
  locationType?: LocationType | string;
  targetProductCount?: number | null;
  color?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  displayOrder?: number;
  lastCountAt?: string | null;
  lastCountedByName?: string | null;
  countStatus?: CountLifecycleStatus;
  countedProductCount?: number;
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
  { labelKey: string; Icon: typeof CheckCircle2; accent: string; accentActive: string }
> = {
  perfect: {
    labelKey: "statusPerfect",
    Icon: CheckCircle2,
    accent: "text-sky-400",
    accentActive: "text-sky-600",
  },
  shortage: {
    labelKey: "statusShortage",
    Icon: AlertTriangle,
    accent: "text-amber-400",
    accentActive: "text-amber-600",
  },
  errors: {
    labelKey: "statusErrors",
    Icon: AlertTriangle,
    accent: "text-rose-400",
    accentActive: "text-rose-600",
  },
};

const CARD_IDLE_BG = "linear-gradient(135deg, #0f172a 0%, #132238 100%)";
const CARD_ACTIVE_BG = "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)";
const BTN_PRIMARY = "linear-gradient(90deg, #2563eb 0%, #4f46e5 100%)";

type Props = {
  shelf: ShelfGridModel;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onOpen: () => void;
  onCardClick?: () => void;
  onMenuAction?: (action: ShelfCardMenuAction) => void;
  busy?: boolean;
  exiting?: boolean;
  entering?: boolean;
  canManage?: boolean;
  noPermissionTitle?: string;
  isCounting?: boolean;
  elapsedLabel?: string;
  targetMinutes?: number;
  countProgressPct?: number;
  locationTypeLabel?: string;
  locale?: string;
  canDragReorder?: boolean;
  dragging?: boolean;
  onDragHandleStart?: () => void;
  onDragHandleEnd?: () => void;
};

function ShelfGridCardInner({
  shelf,
  t,
  onOpen,
  onCardClick,
  onMenuAction,
  busy,
  exiting,
  entering,
  canManage = true,
  noPermissionTitle,
  isCounting = false,
  elapsedLabel = "00:00",
  targetMinutes = 20,
  countProgressPct,
  locationTypeLabel,
  locale = "he-IL",
  canDragReorder = false,
  dragging = false,
  onDragHandleStart,
  onDragHandleEnd,
}: Props) {
  const ui = statusUi[shelf.visualStatus];
  const StatusIcon = ui.Icon;
  const ringPct = countProgressPct ?? shelf.matchPct;
  const accentClass = isCounting ? ui.accentActive : ui.accent;
  const savedColor = shelf.color?.trim() || null;
  const idleBg = savedColor
    ? `linear-gradient(145deg, ${savedColor} 0%, ${savedColor} 48%, #0b1220 100%)`
    : CARD_IDLE_BG;
  const counted = shelf.countedProductCount ?? 0;
  const total = shelf.productCount;
  const countStatus = isCounting ? "IN_PROGRESS" : shelf.countStatus ?? "NOT_STARTED";

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const dragBtn = canDragReorder ? (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", shelf.locationId ?? shelf.name);
        onDragHandleStart?.();
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        onDragHandleEnd?.();
      }}
      onClick={(e) => e.stopPropagation()}
      className={`grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-xl border cursor-grab active:cursor-grabbing ${
        isCounting
          ? "border-slate-200 bg-white text-slate-500"
          : "border-white/20 bg-black/25 text-white/90"
      }`}
      aria-label={t("dragHandle")}
      title={t("dragHandle")}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  ) : null;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 md:overflow-visible md:rounded-[24px] ${
        isCounting
          ? "border-[#bfdbfe] shadow-[0_8px_28px_rgba(37,99,235,0.12)]"
          : "border-white/[0.08] shadow-[0_4px_20px_rgba(15,23,42,0.25)] md:hover:-translate-y-0.5 md:hover:shadow-[0_8px_28px_rgba(15,23,42,0.35)]"
      } ${exiting ? "pointer-events-none scale-95 opacity-0" : ""} ${
        entering ? "animate-[shelf-enter_0.35s_ease-out]" : ""
      } ${busy ? "opacity-85" : ""} ${onCardClick ? "cursor-pointer" : ""} ${
        dragging ? "ring-2 ring-[#6c4cff] ring-offset-1 opacity-90" : ""
      } p-2.5 md:p-5`}
      style={{ background: isCounting ? CARD_ACTIVE_BG : idleBg }}
      dir="rtl"
      onClick={() => onCardClick?.()}
    >
      {savedColor ? (
        <div
          className="absolute inset-y-0 start-0 w-1 rounded-s-2xl md:w-1.5 md:rounded-s-[24px]"
          style={{ background: savedColor }}
          aria-hidden
        />
      ) : null}

      {busy ? (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl md:rounded-[24px] ${
            isCounting ? "bg-white/70" : "bg-[#0f172a]/60"
          }`}
          aria-hidden
        >
          <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
        </div>
      ) : null}

      {/* ——— Mobile compact ——— */}
      <div className="md:hidden">
        <div className="flex items-start gap-1">
          {dragBtn}
          <div className="min-w-0 flex-1 text-end">
            <h3
              className={`line-clamp-2 text-[13px] font-black leading-tight ${
                isCounting ? "text-slate-900" : "text-white"
              }`}
            >
              {shelf.name}
            </h3>
            <p
              className={`mt-0.5 text-[11px] font-bold tabular-nums ${
                isCounting ? "text-slate-600" : "text-slate-300"
              }`}
            >
              {counted}/{total}
            </p>
          </div>
          {onMenuAction ? (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <ShelfCardActionsMenu
                onAction={onMenuAction}
                busy={busy}
                disabled={!canManage}
                disabledTitle={noPermissionTitle}
                variant={isCounting ? "light" : "dark"}
              />
            </div>
          ) : null}
        </div>

        <div
          className={`mt-2 h-1.5 overflow-hidden rounded-full ${
            isCounting ? "bg-slate-200" : "bg-white/15"
          }`}
        >
          <div
            className="h-full rounded-full bg-[#6c4cff] transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, ringPct))}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span
            className={`text-[10px] font-black tabular-nums ${
              isCounting ? "text-slate-500" : "text-white/70"
            }`}
          >
            {Math.round(ringPct)}%
          </span>
          {shelf.shortageCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-rose-400">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {shelf.shortageCount}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-black ${accentClass}`}>
              <StatusIcon className="h-3 w-3" aria-hidden />
              {countStatus === "COMPLETED" ? "✓" : countStatus === "IN_PROGRESS" ? "…" : "○"}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="mt-2 flex h-10 w-full touch-manipulation items-center justify-center gap-1 rounded-xl text-[11px] font-black text-white disabled:opacity-60"
          style={{ background: BTN_PRIMARY }}
        >
          {isCounting ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
          )}
          {isCounting ? t("finishCount") : t("startCount")}
        </button>
      </div>

      {/* ——— Desktop / tablet full ——— */}
      <div className="hidden md:block">
        {isCounting ? (
          <div
            className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-l from-[#2563eb] to-[#06b6d4]"
            aria-hidden
          />
        ) : null}

        <div
          className={`mb-3 flex flex-wrap items-center gap-1.5 ${
            canDragReorder ? "ltr:pl-12 rtl:pr-12" : ""
          }`}
        >
          {canDragReorder ? (
            <div className="absolute top-3 z-20 ltr:left-3 rtl:right-3">{dragBtn}</div>
          ) : null}
          {countStatus === "IN_PROGRESS" ? (
            <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
              {t("badgeActiveCount")}
            </span>
          ) : countStatus === "COMPLETED" ? (
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
              {t("badgeCompleted")}
            </span>
          ) : (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                isCounting ? "bg-slate-200 text-slate-700" : "bg-white/15 text-white/90"
              }`}
            >
              {t("badgeNotStarted")}
            </span>
          )}
          {locationTypeLabel ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                isCounting ? "bg-violet-100 text-violet-800" : "bg-white/10 text-white/80"
              }`}
            >
              {locationTypeLabel}
            </span>
          ) : null}
          {shelf.code ? (
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                isCounting ? "bg-slate-100 text-slate-600" : "bg-white/10 text-white/70"
              }`}
            >
              {shelf.code}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          <div className="min-w-0 flex-1 text-end lg:order-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className={`truncate text-lg font-black lg:text-xl ${
                    isCounting ? "text-slate-900" : "text-white"
                  }`}
                >
                  {shelf.name}
                </h3>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    isCounting ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {t("targetMinutes", { minutes: targetMinutes })}
                  {shelf.targetProductCount != null
                    ? ` · ${t("targetProducts", { count: shelf.targetProductCount })}`
                    : ""}
                </p>
              </div>
              {onMenuAction ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <ShelfCardActionsMenu
                    onAction={onMenuAction}
                    busy={busy}
                    disabled={!canManage}
                    disabledTitle={noPermissionTitle}
                    variant={isCounting ? "light" : "dark"}
                  />
                </div>
              ) : null}
            </div>

            <ul
              className={`mt-3 space-y-0.5 text-xs font-bold ${
                isCounting ? "text-slate-600" : "text-slate-300"
              }`}
            >
              <li>{t("metricProducts", { count: shelf.productCount })}</li>
              <li className={isCounting ? "text-rose-600" : "text-rose-400"}>
                {t("metricShort", { count: shelf.shortageCount })}
              </li>
              <li className={isCounting ? "text-amber-600" : "text-amber-400"}>
                {t("metricSurplus", { count: shelf.surplusCount })}
              </li>
              <li>{t("createdAt", { date: fmtDate(shelf.createdAt) })}</li>
              <li>{t("lastCountAt", { date: fmtDate(shelf.lastCountAt) })}</li>
              <li>
                {t("lastCountedBy", {
                  name: shelf.lastCountedByName?.trim() || t("unknownUser"),
                })}
              </li>
            </ul>

            <p className={`mt-2 inline-flex items-center gap-1 text-[10px] font-black ${accentClass}`}>
              <StatusIcon className="h-3 w-3" aria-hidden />
              {t(ui.labelKey)} · {t("metricMatch", { pct: shelf.matchPct })}
            </p>
          </div>

          <div className="flex shrink-0 justify-center lg:order-2" dir="ltr">
            <ShelfCountProgressRing
              timeLabel={isCounting ? elapsedLabel : "—"}
              progressPct={ringPct}
              timeCaption={t("timerLabel")}
              active={isCounting}
              activeBadge={t("activeBadge")}
            />
          </div>

          <div className="shrink-0 lg:order-1 lg:w-[10rem]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-sm transition duration-200 hover:brightness-[1.08] active:scale-[0.99] disabled:opacity-60"
              style={{ background: BTN_PRIMARY }}
            >
              {isCounting ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden />
              )}
              {isCounting ? t("finishCount") : t("startCount")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export const ShelfGridCard = memo(ShelfGridCardInner);
