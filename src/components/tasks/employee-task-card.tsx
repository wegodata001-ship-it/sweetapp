"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Square,
  Timer,
} from "lucide-react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import {
  formatTimerMs,
  getTimerSnapshot,
  type ProgressBarTone,
} from "@/lib/tasks/timer-display";
import { useI18n } from "@/components/i18n-provider";

const BAR_CLASS: Record<ProgressBarTone, string> = {
  blue: "bg-[#2563eb]",
  yellow: "bg-[#f59e0b]",
  red: "bg-[#dc2626]",
  neutral: "bg-slate-300",
};

export type EmployeeTaskCardProps = {
  task: SerializedWorkEmployeeTask;
  isActive: boolean;
  isCollapsed: boolean;
  busy: boolean;
  canStart: boolean;
  canComplete: boolean;
  onStart: () => void;
  onComplete: () => void;
};

export function EmployeeTaskCard({
  task,
  isActive,
  isCollapsed,
  busy,
  canStart,
  canComplete,
  onStart,
  onComplete,
}: EmployeeTaskCardProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const isLive = task.status === "IN_PROGRESS";
  const isDone = task.status === "COMPLETED";
  const isPending = task.status === "PENDING";

  useEffect(() => {
    if (!isLive || !task.started_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isLive, task.started_at, task.id]);

  const { tp, progressPct, barTone, mainDisplay } = getTimerSnapshot({
    estimatedMinutes: task.estimated_minutes,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    nowMs: now,
  });

  const isLate = isLive && tp.isOver && task.estimated_minutes > 0;

  const shellClass = [
    "relative overflow-hidden rounded-3xl border transition-all duration-300 motion-safe:transition-[transform,opacity,box-shadow]",
    isActive
      ? `etask-card-active border-[#2563eb] bg-gradient-to-br from-blue-50/95 via-white to-sky-50/80 p-5 shadow-[0_20px_48px_-20px_rgba(37,99,235,0.45)] sm:p-7 ${isLate ? "wf-pulse-late" : "wf-pulse"}`
      : isDone
        ? "border-[#16a34a]/50 bg-gradient-to-br from-emerald-50/90 to-white p-4 opacity-95 sm:p-5"
        : isLate && !isCollapsed
          ? "border-amber-300/70 bg-gradient-to-br from-amber-50/70 to-white p-4 sm:p-5"
          : "border-slate-200 bg-white p-4 sm:p-5",
    isCollapsed && !isActive ? "scale-[0.98] opacity-55 saturate-75" : "",
    isCollapsed && !isActive ? "max-sm:p-3" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const titleClass = isActive
    ? "text-2xl font-black text-slate-950 sm:text-[24px]"
    : isCollapsed
      ? "text-base font-bold text-slate-800"
      : "text-xl font-black text-slate-950";

  const timerSizeClass = isActive
    ? "text-[clamp(3rem,12vw,4rem)] leading-none sm:text-[64px]"
    : isCollapsed
      ? "text-2xl"
      : "text-[clamp(2.5rem,10vw,3.25rem)]";

  return (
    <article className={shellClass} aria-current={isActive ? "step" : undefined}>
      {isActive ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2563eb] via-sky-400 to-[#2563eb]"
          aria-hidden
        />
      ) : null}

      <div
        className={`grid gap-5 ${
          isActive
            ? "lg:grid-cols-[minmax(9rem,11rem)_1fr_minmax(8.5rem,10rem)] lg:items-center"
            : "lg:grid-cols-[minmax(7rem,9rem)_1fr_auto] lg:items-center"
        }`}
      >
        {/* Zone 1 — timer / status */}
        <div
          className={`flex flex-col items-center justify-center rounded-2xl px-3 py-4 text-center ${
            isActive
              ? "bg-[#2563eb]/8 ring-1 ring-[#2563eb]/20"
              : isDone
                ? "bg-[#16a34a]/10"
                : "bg-slate-50"
          } ${isCollapsed && !isActive ? "py-2" : "min-h-[7rem] sm:min-h-[8.5rem]"}`}
        >
          {isDone ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-[#16a34a] sm:h-14 sm:w-14" aria-hidden />
              <p className="mt-2 text-sm font-black text-[#16a34a]">{t("employee.tasks.completedBadge")}</p>
            </>
          ) : isLive && mainDisplay ? (
            <>
              <p
                className={`etask-timer-pulse font-black tabular-nums tracking-tight text-[#2563eb] ${timerSizeClass} ${
                  isLate ? "text-[#dc2626]" : ""
                }`}
                aria-live="polite"
              >
                {mainDisplay}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {tp.isOver ? t("tasks.timer.late") : isActive ? t("tasks.timer.remaining") : t("employee.tasks.active")}
              </p>
            </>
          ) : (
            <>
              <Timer className="h-8 w-8 text-slate-400" aria-hidden />
              {task.estimated_minutes ? (
                <p className="mt-2 text-sm font-bold text-slate-600">
                  {t("employee.tasks.targetShort", { minutes: task.estimated_minutes })}
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-slate-500">{t("tasks.timer.noTimer")}</p>
              )}
            </>
          )}
        </div>

        {/* Zone 2 — task info */}
        <div className={`min-w-0 space-y-3 ${isCollapsed && !isActive ? "space-y-1" : ""}`}>
          <div className="flex flex-wrap items-start gap-2">
            {!isDone && !isLive ? (
              <Circle className="mt-1 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
            ) : null}
            <h2 className={`min-w-0 flex-1 ${titleClass}`}>{task.title}</h2>
          </div>

          {!isCollapsed || isActive ? (
            <>
              {task.estimated_minutes ? (
                <p className="text-sm font-semibold text-slate-600">
                  {t("employee.tasks.targetTime", { minutes: task.estimated_minutes })}
                </p>
              ) : null}

              {isLive && task.started_at ? (
                <p className="text-sm font-bold text-slate-700">
                  {t("tasks.timer.elapsedPrefix", {
                    time: formatTimerMs(tp.elapsedMs),
                  })}
                </p>
              ) : null}

              {isLate ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {t("employee.experience.lateSoftLabel")}
                </p>
              ) : null}

              {isLive && task.estimated_minutes > 0 && (!isCollapsed || isActive) ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500">
                    <span>{t("tasks.timer.targetLine", { minutes: task.estimated_minutes, percent: progressPct })}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${BAR_CLASS[barTone]}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {isDone && task.delay_reason ? (
                <p className="text-xs font-semibold text-amber-800">{task.delay_reason}</p>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Zone 3 — actions */}
        {!isDone && !(isCollapsed && !canStart && !canComplete) ? (
          <div
            className={`flex flex-col gap-2 ${isActive ? "w-full lg:w-auto" : "w-full sm:flex-row lg:flex-col lg:items-stretch"}`}
          >
            {isLive ? (
              <button
                type="button"
                disabled={!canComplete || busy}
                onClick={onComplete}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] px-5 py-3.5 text-base font-black text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
                {t("employee.tasks.completeTaskBtn")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canStart || busy}
                onClick={onStart}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-5 py-3.5 text-base font-black text-white shadow-md transition hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
                {t("employee.tasks.startTaskBtn")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
