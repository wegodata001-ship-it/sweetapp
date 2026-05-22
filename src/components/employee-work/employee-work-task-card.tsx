"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Lock,
  Play,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { TaskColorPicker } from "@/components/employee-work/task-color-picker";
import { TaskStatusPill } from "@/components/tasks/cards/task-status-pill";
import type { TaskLockState } from "@/lib/work-tasks/employee-work-lock";
import { getTaskAccentStyle } from "@/lib/work-tasks/task-color-presets";
import type { SerializedEmployeeTask } from "@/lib/work-tasks/serialize-employee-work";

function statusVariant(status: string, late: boolean): "PENDING" | "ACTIVE" | "COMPLETED" | "LATE" {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "IN_PROGRESS") return late ? "LATE" : "ACTIVE";
  return "PENDING";
}

function isLate(task: SerializedEmployeeTask): boolean {
  if (task.status === "COMPLETED") return false;
  if (!task.target_due_at) return false;
  return new Date(task.target_due_at).getTime() < Date.now();
}

type Props = {
  task: SerializedEmployeeTask;
  canManage: boolean;
  busy?: boolean;
  nested?: boolean;
  lock?: TaskLockState;
  expanded?: boolean;
  onToggle?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onSave?: (patch: {
    title: string;
    estimatedMinutes: number;
    description: string;
    materials: string;
    targetDueAt: string;
    color: string | null;
  }) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
};

export function EmployeeWorkTaskCard({
  task,
  canManage,
  busy,
  nested,
  lock,
  expanded: expandedProp,
  onToggle,
  onStart,
  onComplete,
  onDelete,
  onSave,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const expanded = expandedProp ?? open;
  const late = isLate(task);
  const variant = statusVariant(task.status, late);
  const locked = !canManage && (lock?.locked ?? false);
  const accent = getTaskAccentStyle(task.color);

  const [title, setTitle] = useState(task.title);
  const [minutes, setMinutes] = useState(String(task.estimated_minutes));
  const [desc, setDesc] = useState(task.description ?? "");
  const [materials, setMaterials] = useState(task.materials ?? "");
  const [color, setColor] = useState<string | null>(task.color);
  const [due, setDue] = useState(
    task.target_due_at ? new Date(task.target_due_at).toISOString().slice(11, 16) : "",
  );

  useEffect(() => {
    setTitle(task.title);
    setMinutes(String(task.estimated_minutes));
    setDesc(task.description ?? "");
    setMaterials(task.materials ?? "");
    setColor(task.color);
    setDue(task.target_due_at ? new Date(task.target_due_at).toISOString().slice(11, 16) : "");
  }, [task]);

  const toggle = () => {
    if (locked && !canManage) return;
    setOpen((v) => !v);
    onToggle?.();
  };

  const handleStart = () => {
    if (locked) return;
    onStart?.();
  };

  const handleComplete = () => {
    onComplete?.();
    setJustDone(true);
    window.setTimeout(() => setJustDone(false), 700);
  };

  const statusLabel =
    task.status === "COMPLETED"
      ? t("workflows.page.badge.completed")
      : task.status === "IN_PROGRESS"
        ? late
          ? t("workflows.page.badge.late")
          : t("workflows.page.badge.inProgress")
        : locked
          ? t("workflows.employeeWork.status.locked")
          : t("workflows.employeeWork.status.pending");

  return (
    <li
      className={`ew-task-card rounded-xl bg-white shadow-sm ring-1 transition ${
        justDone ? "ew-task-complete-pop" : ""
      } ${locked ? "ew-task-locked opacity-60" : ""} ${
        nested ? "ms-0 sm:ms-1" : ""
      } ${
        task.status === "IN_PROGRESS"
          ? late
            ? "ring-rose-200"
            : "ring-blue-200"
          : "ring-slate-100"
      } ${lock?.isNext && !canManage ? "ew-task-unlock-glow ring-violet-300" : ""}`}
      style={accent as React.CSSProperties}
      draggable={draggable && canManage && !locked}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-stretch gap-1 p-2">
        {task.color ? (
          <span
            className="mt-2 h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
            style={{ backgroundColor: task.color }}
            aria-hidden
          />
        ) : null}
        {canManage ? (
          <span className="flex cursor-grab items-center px-0.5 text-slate-300">
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
        ) : locked ? (
          <span className="flex items-center px-0.5 text-slate-400" title={t("workflows.employeeWork.lockHint")}>
            <Lock className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          disabled={locked && !canManage}
          className={`min-w-0 flex-1 text-start ${locked && !canManage ? "cursor-not-allowed" : ""}`}
          title={locked ? t("workflows.employeeWork.lockHint") : undefined}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{task.title}</p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                {task.estimated_minutes}&apos; {due ? `· ${due}` : ""}
              </p>
            </div>
            <TaskStatusPill variant={locked ? "PENDING" : variant} label={statusLabel} compact />
          </div>
        </button>
        <div className="flex shrink-0 flex-col gap-1">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
          )}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-100 px-2 pb-2 pt-1.5">
          {canManage ? (
            <div className="space-y-1.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 w-full rounded-lg border-0 bg-slate-50 px-2 text-xs font-bold ring-1 ring-slate-200"
              />
              <TaskColorPicker value={color} onChange={setColor} compact />
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="number"
                  min={0}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="h-8 rounded-lg bg-slate-50 px-2 text-xs font-bold ring-1 ring-slate-200"
                />
                <input
                  type="time"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="h-8 rounded-lg bg-slate-50 px-2 text-xs font-bold ring-1 ring-slate-200"
                />
              </div>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder={t("workflows.cards.notesPh")}
                className="w-full resize-none rounded-lg bg-slate-50 px-2 py-1 text-xs ring-1 ring-slate-200"
              />
              <input
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                placeholder={t("workflows.employeeWork.fields.materials")}
                className="h-8 w-full rounded-lg bg-slate-50 px-2 text-xs font-bold ring-1 ring-slate-200"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSave?.({
                    title,
                    estimatedMinutes: Number(minutes) || 15,
                    description: desc,
                    materials,
                    targetDueAt: due,
                    color,
                  })
                }
                className="flex h-9 w-full items-center justify-center gap-1 rounded-lg bg-slate-900 text-xs font-black text-white"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {t("common.save")}
              </button>
            </div>
          ) : (
            <div className="space-y-1 text-xs text-slate-600">
              {task.description ? <p>{task.description}</p> : null}
              {task.materials ? (
                <p>
                  <strong>{t("workflows.employeeWork.fields.materials")}:</strong> {task.materials}
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-2 flex gap-1">
            {!canManage && task.status === "PENDING" && !locked ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 py-2.5 text-xs font-black text-white"
              >
                <Play className="h-3.5 w-3.5" />
                {t("workflows.page.steps.start")}
              </button>
            ) : null}
            {!canManage && task.status === "IN_PROGRESS" ? (
              <button
                type="button"
                onClick={handleComplete}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-black text-white"
              >
                <Check className="h-3.5 w-3.5" />
                {t("workflows.page.steps.complete")}
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
