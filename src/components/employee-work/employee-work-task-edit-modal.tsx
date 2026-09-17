"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { TaskColorPicker } from "@/components/employee-work/task-color-picker";
import type { SerializedEmployeeTask } from "@/lib/work-tasks/serialize-employee-work";

export type EmployeeWorkTaskEditPatch = {
  title: string;
  estimatedMinutes: number;
  description: string;
  materials: string;
  targetDueAt: string;
  color: string | null;
  orderNumber: number;
};

type Props = {
  open: boolean;
  busy?: boolean;
  task: SerializedEmployeeTask;
  listLength: number;
  onCancel: () => void;
  onSave: (patch: EmployeeWorkTaskEditPatch) => void;
};

export function EmployeeWorkTaskEditModal({
  open,
  busy,
  task,
  listLength,
  onCancel,
  onSave,
}: Props) {
  const { t, dir } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [materials, setMaterials] = useState(task.materials ?? "");
  const [minutes, setMinutes] = useState(String(task.estimated_minutes));
  const [due, setDue] = useState(
    task.target_due_at ? new Date(task.target_due_at).toISOString().slice(11, 16) : "",
  );
  const [color, setColor] = useState<string | null>(task.color);
  const [orderNumber, setOrderNumber] = useState(String(task.order_index + 1));

  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setMaterials(task.materials ?? "");
    setMinutes(String(task.estimated_minutes));
    setDue(task.target_due_at ? new Date(task.target_due_at).toISOString().slice(11, 16) : "");
    setColor(task.color);
    setOrderNumber(String(task.order_index + 1));
  }, [open, task]);

  if (!open) return null;

  const save = () => {
    const nextOrder = Math.min(
      Math.max(1, parseInt(orderNumber, 10) || task.order_index + 1),
      Math.max(1, listLength),
    );
    onSave({
      title: title.trim() || task.title,
      description,
      materials,
      estimatedMinutes: Number(minutes) || 15,
      targetDueAt: due,
      color,
      orderNumber: nextOrder,
    });
  };

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
        <h3 className="text-base font-black text-slate-950">{t("workflows.employeeWork.editTaskTitle")}</h3>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-black text-slate-700">
            {t("workflows.employeeWork.fields.taskTitle")}
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
              rows={3}
              placeholder={t("workflows.employeeWork.taskDescriptionPlaceholder")}
              className="mt-1 w-full resize-none rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black text-slate-700">
              {t("workflows.employeeWork.fields.taskOrder")}
              <input
                type="number"
                min={1}
                max={Math.max(1, listLength)}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
              />
            </label>
            <label className="block text-xs font-black text-slate-700">
              {t("workflows.employeeWork.fields.minutes")}
              <input
                type="number"
                min={0}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black text-slate-700">
              {t("workflows.employeeWork.fields.dueTime")}
              <input
                type="time"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
              />
            </label>
            <label className="block text-xs font-black text-slate-700">
              {t("workflows.employeeWork.fields.materials")}
              <input
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-900 ring-1 ring-slate-200"
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-black text-slate-700">{t("workflows.employeeWork.colorLabel")}</p>
            <div className="mt-1">
              <TaskColorPicker value={color} onChange={setColor} />
            </div>
          </div>
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
            onClick={save}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("workflows.employeeWork.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
