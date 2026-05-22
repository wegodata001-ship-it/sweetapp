"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  open: boolean;
  groupTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Small confirm dialog for deleting a task group (template). */
export function TaskGroupDeleteModal({ open, groupTitle, busy, onCancel, onConfirm }: Props) {
  const { t, dir } = useI18n();
  if (!open) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcg-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="tcg-fade-in w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-700">
            <Trash2 className="h-5 w-5" aria-hidden />
          </span>
          <h3 id="tcg-delete-title" className="text-base font-black text-slate-950">
            {t("workflows.cards.deleteTitle")}
          </h3>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-700">
          {t("workflows.cards.deleteBody", { name: groupTitle })}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">{t("workflows.cards.deleteHint")}</p>
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("workflows.cards.deleteConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
