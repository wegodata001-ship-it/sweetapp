"use client";

import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  open: boolean;
  title: string;
  body: string;
  hint?: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "warning" | "primary";
  icon?: LucideIcon;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmActionModal({
  open,
  title,
  body,
  hint,
  confirmLabel,
  busy,
  tone = "danger",
  icon: Icon,
  onCancel,
  onConfirm,
}: Props) {
  const { t, dir } = useI18n();
  if (!open) return null;

  const btn =
    tone === "primary"
      ? "bg-violet-600 hover:bg-violet-700"
      : tone === "warning"
        ? "bg-amber-600 hover:bg-amber-700"
        : "bg-rose-600 hover:bg-rose-700";

  const iconBg =
    tone === "primary" ? "bg-violet-100 text-violet-700" : tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700";

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="tcg-fade-in w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${iconBg}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <h3 className="text-base font-black text-slate-950">{title}</h3>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-700">{body}</p>
        {hint ? <p className="mt-1 text-xs font-bold text-slate-500">{hint}</p> : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:opacity-50 ${btn}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
