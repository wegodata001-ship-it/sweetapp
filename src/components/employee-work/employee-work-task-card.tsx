"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  EmployeeWorkTaskEditModal,
  type EmployeeWorkTaskEditPatch,
} from "@/components/employee-work/employee-work-task-edit-modal";
import { useI18n } from "@/components/i18n-provider";
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
  onSave?: (patch: EmployeeWorkTaskEditPatch) => void;
  listLength?: number;
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
  listLength = 1,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const expanded = expandedProp ?? open;
  const late = isLate(task);
  const variant = statusVariant(task.status, late);
  const locked = !canManage && (lock?.locked ?? false);
  const accent = getTaskAccentStyle(task.color);
  const due = task.target_due_at ? new Date(task.target_due_at).toISOString().slice(11, 16) : "";

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
        <div className="flex items-start gap-2 p-2.5">
          {task.color ? (
            <span
              className="mt-2 h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: task.color }}
              aria-hidden
            />
          ) : null}
          {canManage ? (
            <span className="flex cursor-grab items-center px-0.5 pt-1 text-slate-300">
              <GripVertical className="h-4 w-4" aria-hidden />
            </span>
          ) : locked ? (
            <span className="flex items-center px-0.5 pt-1 text-slate-400" title={t("workflows.employeeWork.lockHint")}>
              <Lock className="h-4 w-4" aria-hidden />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={toggle}
                disabled={locked && !canManage}
                className={`min-w-0 flex-1 text-start ${locked && !canManage ? "cursor-not-allowed" : ""}`}
                title={locked ? t("workflows.employeeWork.lockHint") : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                        {task.order_index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-black leading-5 text-slate-900 sm:text-[15px]">
                          {task.title}
                        </p>
                        {task.description ? (
                          <p className="mt-1 whitespace-pre-line break-words text-xs leading-5 text-slate-500">
                            {task.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[10px] font-bold text-slate-500">
                          {task.estimated_minutes}&apos; {due ? `· ${due}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <TaskStatusPill variant={locked ? "PENDING" : variant} label={statusLabel} compact />
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label={t("workflows.employeeWork.editTaskAria")}
                    title={t("common.edit")}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={toggle}
                  className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-50"
                  aria-label={expanded ? t("common.close") : t("common.details")}
                >
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-2">
            <div className="space-y-1 text-xs text-slate-600">
              {task.materials ? (
                <p className="break-words">
                  <strong>{t("workflows.employeeWork.fields.materials")}:</strong> {task.materials}
                </p>
              ) : null}
            </div>

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
                  {t("common.delete")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

      {canManage ? (
        <EmployeeWorkTaskEditModal
          open={editOpen}
          busy={busy}
          task={task}
          listLength={listLength}
          onCancel={() => setEditOpen(false)}
          onSave={(patch) => {
            onSave?.(patch);
            setEditOpen(false);
          }}
        />
      ) : null}
    </li>
  );
}
