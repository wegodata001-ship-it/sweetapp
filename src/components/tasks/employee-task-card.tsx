"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Square,
} from "lucide-react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { useI18n } from "@/components/i18n-provider";
import { TaskCountdownRing } from "@/components/tasks/task-countdown-ring";
import { computeCountdownTimer } from "@/lib/tasks/countdown-timer";

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
  const isLive = task.status === "IN_PROGRESS";
  const isDone = task.status === "COMPLETED";
  const hasTimer = (task.estimated_minutes ?? 0) > 0;

  const snap = computeCountdownTimer({
    estimatedMinutes: task.estimated_minutes,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    taskStatus: task.status,
    nowMs: Date.now(),
  });

  const isLate = isLive && snap.isOverdue;

  const shellClass = [
    "relative overflow-hidden rounded-3xl border transition-all duration-300 motion-safe:transition-[transform,opacity,box-shadow]",
    isActive
      ? `etask-card-active border-slate-800/10 bg-gradient-to-br from-[#071826] via-[#0d2137] to-[#0f172a] p-4 shadow-[0_24px_56px_-16px_rgba(7,24,38,0.65)] sm:p-6 ${isLate ? "wf-pulse-late" : ""}`
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
    ? "text-xl font-black text-white sm:text-2xl"
    : isCollapsed
      ? "text-base font-bold text-slate-800"
      : "text-xl font-black text-slate-950";

  return (
    <article className={shellClass} aria-current={isActive ? "step" : undefined}>
      {isActive ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400"
          aria-hidden
        />
      ) : null}

      <div
        className={`flex flex-col gap-5 ${
          isActive
            ? "lg:flex-row lg:items-center lg:justify-between"
            : "lg:grid lg:grid-cols-[minmax(8rem,10rem)_1fr_auto] lg:items-center"
        }`}
      >
        {/* Timer — מרכז במובייל, צד בשורה רחבה */}
        <div
          className={`flex shrink-0 justify-center ${
            isActive ? "order-1 w-full lg:order-none lg:w-auto" : ""
          } ${isCollapsed && !isActive && hasTimer ? "max-w-[7rem]" : ""}`}
        >
          {isDone ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-[#16a34a]/10 px-4 py-6 text-center min-h-[7rem]">
              <CheckCircle2 className="h-14 w-14 text-[#16a34a]" aria-hidden />
              <p className="mt-2 text-sm font-black text-[#16a34a]">{t("employee.tasks.completedBadge")}</p>
            </div>
          ) : hasTimer ? (
            <TaskCountdownRing
              taskTitle={isActive ? undefined : task.title}
              estimatedMinutes={task.estimated_minutes}
              startedAt={task.started_at}
              completedAt={task.completed_at}
              taskStatus={task.status}
              size={isActive ? "large" : isCollapsed ? "compact" : "default"}
              showMeta={isActive}
              showTitle={!isActive && !isCollapsed}
            />
          ) : (
            <div className="flex min-h-[7rem] flex-col items-center justify-center rounded-2xl bg-slate-50 px-4 py-4 text-center">
              <p className="text-xs font-semibold text-slate-500">{t("tasks.timer.noTimer")}</p>
            </div>
          )}
        </div>

        {/* פרטי משימה */}
        <div
          className={`min-w-0 flex-1 space-y-3 ${isActive ? "order-2 text-center lg:order-none lg:text-start" : ""} ${
            isCollapsed && !isActive ? "space-y-1" : ""
          }`}
        >
          <div className={`flex flex-wrap items-start gap-2 ${isActive ? "justify-center lg:justify-start" : ""}`}>
            {!isDone && !isLive ? (
              <Circle className="mt-1 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
            ) : null}
            <h2 className={`min-w-0 flex-1 ${titleClass}`}>{task.title}</h2>
          </div>

          {!isCollapsed || isActive ? (
            <>
              {task.estimated_minutes && !isActive ? (
                <p className="text-sm font-semibold text-slate-600">
                  {t("employee.tasks.targetTime", { minutes: task.estimated_minutes })}
                </p>
              ) : null}

              {isActive && task.description ? (
                <p className="text-sm font-medium text-slate-300">{task.description}</p>
              ) : null}

              {isLate ? (
                <p
                  className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-black text-rose-200 ${
                    isActive ? "mx-auto lg:mx-0" : ""
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {t("employee.experience.lateSoftLabel")}
                </p>
              ) : null}

              {isDone && task.delay_reason ? (
                <p className="text-xs font-semibold text-amber-800">{task.delay_reason}</p>
              ) : null}
            </>
          ) : null}
        </div>

        {/* פעולות */}
        {!isDone && !(isCollapsed && !canStart && !canComplete) ? (
          <div
            className={`flex flex-col gap-2 ${isActive ? "order-3 w-full lg:order-none lg:w-auto lg:min-w-[10rem]" : "w-full sm:flex-row lg:flex-col"}`}
          >
            {isLive ? (
              <button
                type="button"
                disabled={!canComplete || busy}
                onClick={onComplete}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-600 hover:shadow-xl disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
                {t("employee.tasks.completeTaskBtn")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canStart || busy}
                onClick={onStart}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700 hover:shadow-xl disabled:opacity-40"
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
