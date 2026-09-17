"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { WorkflowTemplateItemDto } from "@/lib/workflows/serialize";

export type TemplateTaskEditPatch = {
  title: string;
  description: string;
  estimatedMinutes: number;
};

type Props = {
  busy?: boolean;
  item: WorkflowTemplateItemDto;
  onCancel: () => void;
  onSave: (patch: TemplateTaskEditPatch) => Promise<boolean> | boolean;
};

export function TemplateTaskEditModal({
  busy,
  item,
  onCancel,
  onSave,
}: Props) {
  const { t, dir } = useI18n();
  const [title, setTitle] = useState(item.display_title);
  const [description, setDescription] = useState(item.task_description ?? "");
  const [minutes, setMinutes] = useState(String(item.effective_minutes));

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
      <div className="tcg-fade-in w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <h3 className="text-base font-black text-slate-950">{t("workflows.cards.editTaskTitle")}</h3>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-black text-slate-700">
            {t("workflows.cards.taskNameLabel")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
            />
          </label>

          <label className="block text-xs font-black text-slate-700">
            {t("common.description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={t("workflows.cards.descriptionPlaceholder")}
              className="mt-1 w-full resize-none rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900 ring-1 ring-slate-200"
            />
          </label>

          <label className="block text-xs font-black text-slate-700">
            {t("workflows.cards.minutesLabel")}
            <input
              type="number"
              min={0}
              max={480}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await onSave({
                title: title.trim() || item.display_title,
                description,
                estimatedMinutes: Number(minutes) || item.effective_minutes,
              });
              if (ok) onCancel();
            }}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("workflows.cards.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
