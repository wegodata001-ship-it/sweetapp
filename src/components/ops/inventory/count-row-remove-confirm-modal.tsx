"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  open: boolean;
  productName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** אישור הסרת מוצר מהספירה הנוכחית — מדגיש שהמוצר אינו נמחק מהמערכת */
export function CountRowRemoveConfirmModal({
  open,
  productName,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const { t, dir } = useI18n();
  const tR = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.removeRow.${key}`, vars);

  if (!open) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-100 text-rose-700">
            <Trash2 className="h-5 w-5" aria-hidden />
          </span>
          <h3 className="text-lg font-black text-slate-900">{tR("title")}</h3>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-700">
          {tR("body", { name: productName })}
        </p>
        <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
          {tR("hint")}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl border border-[#e7ecf5] py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 py-2.5 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {tR("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
