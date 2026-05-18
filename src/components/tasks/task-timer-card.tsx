"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Timer } from "lucide-react";
import { timerProgress, type TimerTier } from "@/lib/tasks/helpers";
import { formatTimerMs } from "@/lib/tasks/timer-display";
import { useI18n } from "@/components/i18n-provider";

const TIER_STYLES: Record<TimerTier, { ring: string; text: string; bg: string; labelKey: string; border: string }> = {
  none: {
    ring: "ring-slate-200",
    text: "text-slate-900",
    bg: "bg-slate-50",
    labelKey: "tasks.timer.tierNone",
    border: "border-slate-200",
  },
  green: {
    ring: "ring-emerald-300",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    labelKey: "tasks.timer.tierGreen",
    border: "border-emerald-300",
  },
  yellow: {
    ring: "ring-amber-300",
    text: "text-amber-700",
    bg: "bg-amber-50",
    labelKey: "tasks.timer.tierYellow",
    border: "border-amber-300",
  },
  orange: {
    ring: "ring-orange-400",
    text: "text-orange-700",
    bg: "bg-orange-50",
    labelKey: "tasks.timer.tierOrange",
    border: "border-orange-400",
  },
  red: {
    ring: "ring-red-500",
    text: "text-red-700",
    bg: "bg-red-50",
    labelKey: "tasks.timer.tierRed",
    border: "border-red-500",
  },
};

export function TaskTimerCard({
  estimatedMinutes,
  startedAt,
  completedAt,
  compact = false,
}: {
  estimatedMinutes: number | null | undefined;
  startedAt: string | null;
  completedAt?: string | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || completedAt) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [startedAt, completedAt]);

  const tp = timerProgress({
    estimatedMinutes,
    startedAt,
    completedAt: completedAt ?? null,
    nowMs: now,
  });
  const style = TIER_STYLES[tp.tier];

  if (!startedAt) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-2xl border ${style.border} ${style.bg} px-3 py-2 text-xs font-bold ${style.text}`}
      >
        <Timer className="h-4 w-4" aria-hidden />
        {estimatedMinutes
          ? t("tasks.timer.targetMin", { minutes: estimatedMinutes })
          : t("tasks.timer.noTimer")}
      </div>
    );
  }

  // אם אין יעד — נציג רק זמן עבר
  if (tp.tier === "none") {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-2xl border ${style.border} ${style.bg} px-3 py-2 text-xs font-bold ${style.text}`}
      >
        <Timer className="h-4 w-4" aria-hidden />
        {t("tasks.timer.elapsedPrefix", { time: formatTimerMs(tp.elapsedMs) })}
      </div>
    );
  }

  const ratioPct = Math.min(200, Math.round(tp.ratio * 100));
  const isOver = tp.isOver;
  const display = isOver
    ? formatTimerMs(tp.elapsedMs - tp.estimatedMs) // זמן איחור
    : formatTimerMs(tp.remainingMs);

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 rounded-2xl border-2 ${style.border} ${style.bg} px-3 py-2 ${style.text}`}
        aria-live="polite"
      >
        {isOver ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <Timer className="h-4 w-4" aria-hidden />}
        <div className="text-sm font-black tabular-nums">{display}</div>
        <span className="text-[10px] font-extrabold uppercase opacity-80">
          {isOver ? t("tasks.timer.late") : t("tasks.timer.remaining")}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-3xl border-2 ${style.border} ${style.bg} p-4 shadow-sm ring-2 ring-offset-2 ${style.ring} ${style.text}`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider">
          {isOver ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Timer className="h-3.5 w-3.5" aria-hidden />}
          {t(style.labelKey)}
        </span>
        <span className="text-[11px] font-bold opacity-80">
          {t("tasks.timer.targetLine", { minutes: estimatedMinutes ?? 0, percent: ratioPct })}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-center gap-2">
        <div className="text-5xl font-black tabular-nums leading-none sm:text-6xl">{display}</div>
      </div>
      <div className="mt-2 text-center text-xs font-bold opacity-80">
        {isOver ? t("tasks.timer.exceededHint") : t("tasks.timer.timeUntilTarget")}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            tp.tier === "red"
              ? "bg-red-500"
              : tp.tier === "orange"
                ? "bg-orange-500"
                : tp.tier === "yellow"
                  ? "bg-amber-400"
                  : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(100, Math.round(tp.ratio * 100))}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
