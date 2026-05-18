"use client";

import { Clock3, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export type EmployeeLateReasonModalProps = {
  open: boolean;
  taskTitle: string;
  estimatedMinutes: number | null;
  reason: string;
  error: string | null;
  submitting: boolean;
  quickReasonKeys: readonly string[];
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function EmployeeLateReasonModal({
  open,
  taskTitle,
  estimatedMinutes,
  reason,
  error,
  submitting,
  quickReasonKeys,
  onReasonChange,
  onCancel,
  onSubmit,
}: EmployeeLateReasonModalProps) {
  const { t, dir } = useI18n();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="late-reason-title"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50/95 to-white p-5 shadow-xl"
        dir={dir}
      >
        <div className="flex items-center gap-2 text-amber-900">
          <Clock3 className="h-6 w-6 shrink-0" aria-hidden />
          <h3 id="late-reason-title" className="text-lg font-black">
            {t("employee.experience.lateCalmTitle")}
          </h3>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          <strong>{taskTitle}</strong>
          {estimatedMinutes
            ? t("employee.tasks.lateModalTarget", { minutes: estimatedMinutes })
            : ""}
        </p>
        <p className="mt-2 text-sm text-slate-600">{t("employee.experience.lateCalmPrompt")}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickReasonKeys.map((rk) => {
            const label = t(`employee.tasks.quickReason.${rk}`);
            return (
              <button
                key={rk}
                type="button"
                onClick={() => onReasonChange(label)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  reason === label
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-amber-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          placeholder={t("employee.tasks.lateReasonPlaceholder")}
          className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/50"
        />

        {error ? (
          <p className="mt-2 text-xs font-bold text-amber-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700"
          >
            {t("admin.futureOrders.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("employee.tasks.submitLateReason")}
          </button>
        </div>
      </div>
    </div>
  );
}
