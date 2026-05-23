"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle2, Check, Loader2, Play } from "lucide-react";
import { ShelfCountProgressRing } from "./shelf-count-progress-ring";
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
  isCounting = false,
  elapsedLabel = "00:00",
  targetMinutes = 20,
  countProgressPct,
}: Props) {
  const ui = statusUi[shelf.visualStatus];
  const StatusIcon = ui.Icon;
  const ringPct = countProgressPct ?? shelf.matchPct;
  const accentClass = isCounting ? ui.accentActive : ui.accent;

  return (
    <article
      className={`group relative overflow-hidden rounded-[24px] border p-5 shadow-[0_4px_20px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 ${
        isCounting
          ? "border-[#bfdbfe] shadow-[0_8px_28px_rgba(37,99,235,0.12)]"
          : "border-white/[0.08] shadow-[0_4px_20px_rgba(15,23,42,0.25)] hover:shadow-[0_8px_28px_rgba(15,23,42,0.35)]"
      } ${exiting ? "pointer-events-none scale-95 opacity-0" : ""} ${
        entering ? "animate-[shelf-enter_0.35s_ease-out]" : ""
      } ${busy ? "opacity-85" : ""}`}
      style={{ background: isCounting ? CARD_ACTIVE_BG : CARD_IDLE_BG }}
      dir="rtl"
    >
      {isCounting ? (
        <div
          className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-l from-[#2563eb] to-[#06b6d4]"
          aria-hidden
        />
      ) : null}

      {busy ? (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center rounded-[24px] ${
            isCounting ? "bg-white/70" : "bg-[#0f172a]/60"
          }`}
          aria-hidden
        >
          <Loader2 className="h-7 w-7 animate-spin text-[#2563eb]" />
        </div>
      ) : null}

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
              </p>
            </div>
            {onMenuAction ? (
              <ShelfCardActionsMenu
                onAction={onMenuAction}
                busy={busy}
                disabled={!canManage}
                disabledTitle={noPermissionTitle}
                variant={isCounting ? "light" : "dark"}
              />
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

        <div className="shrink-0 lg:order-1 lg:w-[10rem]">
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
    </article>
  );
}

export const ShelfGridCard = memo(ShelfGridCardInner);
