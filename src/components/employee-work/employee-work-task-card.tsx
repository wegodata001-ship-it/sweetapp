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
import { useEffect, useState } from "react";
import {
  EmployeeWorkTaskEditModal,
  type EmployeeWorkTaskEditPatch,
} from "@/components/employee-work/employee-work-task-edit-modal";
import { useI18n } from "@/components/i18n-provider";
import { TaskStatusPill } from "@/components/tasks/cards/task-status-pill";
import type { TaskLockState } from "@/lib/work-tasks/employee-work-lock";
import { getTaskAccentStyle } from "@/lib/work-tasks/task-color-presets";
import type { SerializedEmployeeTask } from "@/lib/work-tasks/serialize-employee-work";
import { isEmployeeWorkTaskLate } from "@/lib/tasks/completion";
import { TASK_BLOCK_REASONS, activeWorkMs, formatClockHms } from "@/lib/work-tasks/task-timing";

function statusVariant(
  status: string,
  late: boolean,
): "PENDING" | "ACTIVE" | "COMPLETED" | "COMPLETED_LATE" | "LATE" {
  if (status === "COMPLETED") return late ? "COMPLETED_LATE" : "COMPLETED";
  if (status === "IN_PROGRESS") return late ? "LATE" : "ACTIVE";
  return "PENDING";
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
  onDelay?: (reason: string) => void;
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
  onDelay,
  onDelete,
  onSave,
  listLength = 1,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(task.status === "IN_PROGRESS" || task.status === "DELAYED");
  const [editOpen, setEditOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (task.status !== "IN_PROGRESS") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task.status]);
  const expanded = expandedProp ?? open;
  const late = isEmployeeWorkTaskLate({
    status: task.status,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    estimatedMinutes: task.estimated_minutes,
    targetDueAt: task.target_due_at,
  });
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
  };

  const statusLabel =
    task.status === "COMPLETED"
      ? late
        ? `${t("completeTask.completedBadge")} ${t("completeTask.lateBadge")}`
        : t("completeTask.completedBadge")
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
          locked ? "ew-task-locked opacity-60" : ""
        } ${
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

        {task.status === "IN_PROGRESS" || task.status === "DELAYED" || task.late_reason || task.delay_reason ? (
          <div className="space-y-1 px-3 pb-2 font-mono text-sm font-black tabular-nums text-slate-800">
            <p>{t("taskTiming.target")} {formatClockHms(task.estimated_minutes * 60_000)}</p>
            <p>
              {t("taskTiming.worked")}{" "}
              {formatClockHms(activeWorkMs({
                activeWorkMs: task.active_work_ms,
                segmentStartedAt: task.segment_started_at ?? task.started_at,
                status: task.status,
                nowMs,
              }))}
            </p>
            {(() => {
              const worked = activeWorkMs({
                activeWorkMs: task.active_work_ms,
                segmentStartedAt: task.segment_started_at ?? task.started_at,
                status: task.status,
                nowMs,
              });
              const target = task.estimated_minutes * 60_000;
              return worked > target ? <p className="text-rose-700">{t("taskTiming.lateBy")} {formatClockHms(worked - target)}</p> : null;
            })()}
            {task.status === "DELAYED" ? (
              <p className="font-sans text-xs font-bold text-amber-800">
                {t("taskTiming.delayedBadge")} · {t("taskTiming.reasonLabel")}: {task.delay_reason ? t(`taskTiming.reason.${task.delay_reason}`) : "—"}
              </p>
            ) : null}
            {task.late_reason ? (
              <p className="font-sans text-xs font-bold text-amber-800">
                {t("taskTiming.lateReason")}: {t(`taskTiming.reason.${task.late_reason}`)}
              </p>
            ) : null}
          </div>
        ) : null}

        {expanded ? (
          <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-2">
            <div className="space-y-1 text-xs text-slate-600">
              {task.materials ? (
                <p className="break-words">
                  <strong>{t("workflows.employeeWork.fields.materials")}:</strong> {task.materials}
                </p>
              ) : null}
              {task.status === "COMPLETED" && task.completed_at ? (
                <p>
                  <strong>{t("completeTask.completedAt")}:</strong>{" "}
                  {new Date(task.completed_at).toLocaleString()}
                </p>
              ) : null}
              {task.status === "COMPLETED" && late ? (
                <p className="font-black text-amber-800">{t("completeTask.completedLateBadge")}</p>
              ) : null}
              {task.delay_reason ? (
                <p className="whitespace-pre-wrap break-words">
                  <strong>
                    {late ? t("completeTask.lateReasonLabel") : t("completeTask.noteLabel")}:
                  </strong>{" "}
                  {task.delay_reason}
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex gap-1">
              {!canManage && task.status === "IN_PROGRESS" && onDelay ? (
                <button
                  type="button"
                  onClick={() => setDelayOpen(true)}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center rounded-lg border border-amber-300 py-2.5 text-xs font-black text-amber-900"
                >
                  {t("taskTiming.delay")}
                </button>
              ) : null}
              {!canManage && task.status === "DELAYED" ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 py-2.5 text-xs font-black text-white"
                >
                  <Play className="h-3.5 w-3.5" />
                  {t("taskTiming.resume")}
                </button>
              ) : null}
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

      {delayOpen ? (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="dialog">
          <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="text-lg font-black">{t("taskTiming.delayTitle")}</h3>
            <p className="mt-1 text-sm font-bold text-slate-600">{t("taskTiming.whyNow")}</p>
            <div className="mt-3 space-y-2">
              {TASK_BLOCK_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm font-bold">
                  <input type="radio" name={`delay-${task.id}`} checked={delayReason === reason} onChange={() => setDelayReason(reason)} />
                  {t(`taskTiming.reason.${reason}`)}
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="flex-1 rounded-xl bg-amber-500 py-2 text-sm font-black text-slate-950 disabled:opacity-50" disabled={!delayReason} onClick={() => { onDelay?.(delayReason); setDelayOpen(false); setDelayReason(""); }}>
                {t("taskTiming.delayAndNext")}
              </button>
              <button type="button" className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600" onClick={() => setDelayOpen(false)}>{t("common.cancel")}</button>
            </div>
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
