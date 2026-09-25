"use client";

import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { LateDurationParts } from "@/lib/tasks/completion";

export type CompleteTaskModalModel = {
  title: string;
  dueLabel: string;
  statusLabel: string;
  isLate: boolean;
  lateParts: LateDurationParts;
  completeAtLabel: string;
};

type Props = {
  open: boolean;
  task: CompleteTaskModalModel;
  lateReason: string;
  completionNote: string;
  submitting: boolean;
  error: string | null;
  requireLateReason: boolean;
  showCompletionNote?: boolean;
  reasonChoices?: Array<{ value: string; label: string }>;
  clockSummary?: { target: string; actual: string; late: string } | null;
  onLateReasonChange: (value: string) => void;
  onCompletionNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function formatLatePartsLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  parts: LateDurationParts,
): string {
  if (parts.unit === "days") {
    return parts.value === 1 ? t("completeTask.lateDayOne") : t("completeTask.lateDays", { count: parts.value });
  }
  if (parts.unit === "hours") {
    return parts.value === 1 ? t("completeTask.lateHourOne") : t("completeTask.lateHours", { count: parts.value });
  }
  if (parts.unit === "minutes") {
    return parts.value === 1
      ? t("completeTask.lateMinuteOne")
      : t("completeTask.lateMinutes", { count: parts.value });
  }
  return t("completeTask.lateUnknown");
}

export function CompleteTaskModal({
  open,
  task,
  lateReason,
  completionNote,
  submitting,
  error,
  requireLateReason,
  showCompletionNote = true,
  reasonChoices,
  clockSummary,
  onLateReasonChange,
  onCompletionNoteChange,
  onCancel,
  onSubmit,
}: Props) {
  const { t, dir } = useI18n();
  if (!open) return null;

  const lateOk = !requireLateReason || lateReason.trim().length > 0;
  const canSubmit = lateOk && !submitting;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-task-title"
      dir={dir}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="complete-task-title" className="text-lg font-black text-slate-950">
              {t("completeTask.title")}
            </h2>
            <p className="mt-1 break-words text-sm font-bold text-slate-800">{task.title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {t("completeTask.due")}: {task.dueLabel}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              {t("completeTask.status")}: {task.statusLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {task.isLate ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
              <p className="inline-flex items-center gap-2 text-sm font-black">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {t("completeTask.lateBanner")}
              </p>
              {clockSummary ? (
                <>
                  <p className="mt-2 font-mono text-xs font-bold tabular-nums">{t("taskTiming.target")}: {clockSummary.target}</p>
                  <p className="font-mono text-xs font-bold tabular-nums">{t("taskTiming.actual")}: {clockSummary.actual}</p>
                  <p className="font-mono text-xs font-black tabular-nums">{t("taskTiming.lateBy")}: {clockSummary.late}</p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs font-bold">
                    {t("completeTask.due")}: {task.dueLabel}
                  </p>
                  <p className="text-xs font-bold">
                    {t("completeTask.completedOn")}: {task.completeAtLabel}
                  </p>
                  <p className="text-xs font-black">
                    {t("completeTask.lateness")}: {formatLatePartsLabel(t, task.lateParts)}
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-600">{t("completeTask.onTimeHint")}</p>
          )}

          {requireLateReason && reasonChoices ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-black text-slate-900">{t("taskTiming.why")}</legend>
              {reasonChoices.map((choice) => (
                <label key={choice.value} className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="radio"
                    name="late-reason"
                    value={choice.value}
                    checked={lateReason === choice.value}
                    onChange={() => onLateReasonChange(choice.value)}
                  />
                  {choice.label}
                </label>
              ))}
            </fieldset>
          ) : requireLateReason ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-black text-slate-900">
                {t("completeTask.lateReasonLabel")} *
              </span>
              <textarea
                value={lateReason}
                onChange={(e) => onLateReasonChange(e.target.value)}
                rows={5}
                autoFocus
                placeholder={t("completeTask.lateReasonPlaceholder")}
                className="min-h-32 w-full rounded-2xl border border-amber-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60"
              />
              <span className="block text-xs font-bold text-amber-800">
                {t("completeTask.lateReasonRequiredHint")}
              </span>
            </label>
          ) : null}

          {showCompletionNote && !reasonChoices ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-black text-slate-800">{t("completeTask.noteLabel")}</span>
              <textarea
                value={completionNote}
                onChange={(e) => onCompletionNoteChange(e.target.value)}
                rows={requireLateReason ? 3 : 4}
                placeholder={t("completeTask.notePlaceholder")}
                className="min-h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:bg-white focus:ring-2 focus:ring-luxury-gold/20"
              />
            </label>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {submitting ? t("completeTask.submitting") : t("completeTask.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
