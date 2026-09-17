"use client";

import { AlertTriangle, Check, GripVertical, Loader2, Pencil, Play, Timer } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { itemElapsedMs, itemIsLate } from "@/lib/workflows/run-helpers";
import type { WorkflowRunItemDto, WorkflowTemplateItemDto } from "@/lib/workflows/serialize";
import {
  TemplateTaskEditModal,
  type TemplateTaskEditPatch,
} from "./template-task-edit-modal";
import { TaskStatusPill } from "./task-status-pill";

function formatHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

type RunItemProps = {
  kind: "run";
  item: WorkflowRunItemDto;
  now: number;
  busy?: boolean;
  canStart?: boolean;
  canComplete?: boolean;
  canSkip?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onSkip?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
};

type TemplateItemProps = {
  kind: "template";
  item: WorkflowTemplateItemDto;
  index: number;
  canManage?: boolean;
  busy?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSave?: (patch: TemplateTaskEditPatch) => Promise<boolean> | boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
};

type Props = RunItemProps | TemplateItemProps;

/** Compact task row inside a group card. */
export function TaskMiniCard(props: Props) {
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);

  if (props.kind === "template") {
    const {
      item,
      index,
      canManage,
      busy,
      onRemove,
      onMoveUp,
      onMoveDown,
      onSave,
      draggable,
      onDragStart,
      onDragOver,
      onDrop,
    } =
      props;
    const color = item.task_color || "#64748b";
    return (
      <>
        <li
          className="tcg-mini-card rounded-xl bg-white/90 px-2.5 py-2.5 shadow-sm ring-1 ring-white/50"
          draggable={draggable}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <div className="flex items-start gap-2">
            {canManage ? (
              <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-slate-400" aria-hidden />
            ) : null}
            <span
              className="mt-0.5 grid min-h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1 text-[10px] font-black text-white"
              style={{ background: color }}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] font-black leading-5 text-slate-900">
                    {item.display_title}
                  </p>
                  {item.task_description ? (
                    <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-6 text-slate-700">
                      {item.task_description}
                    </p>
                  ) : canManage ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      {t("workflows.cards.noDescription")}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] font-bold text-slate-500">
                    {t("workflows.cards.taskMeta", {
                      minutes: item.effective_minutes,
                    })}
                    {item.require_late_reason ? " · ⚠" : ""}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label={t("workflows.cards.editAria")}
                    title={t("workflows.cards.editAria")}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            {canManage ? (
              <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
                <button type="button" onClick={onMoveUp} className="text-[10px] text-slate-500 hover:text-slate-800">
                  ▲
                </button>
                <button type="button" onClick={onMoveDown} className="text-[10px] text-slate-500 hover:text-slate-800">
                  ▼
                </button>
                <button type="button" onClick={onRemove} className="text-[10px] font-bold text-rose-600">
                  ×
                </button>
              </div>
            ) : null}
          </div>
          {canManage && editOpen ? (
            <TemplateTaskEditModal
              busy={busy}
              item={item}
              onCancel={() => setEditOpen(false)}
              onSave={(patch) => onSave?.(patch) ?? false}
            />
          ) : null}
        </li>
      </>
    );
  }

  const {
    item,
    now,
    busy,
    canStart,
    canComplete,
    canSkip,
    onStart,
    onComplete,
    onSkip,
    draggable,
    onDragStart,
    onDragOver,
    onDrop,
  } = props;

  const elapsed = itemElapsedMs(item.started_at, item.completed_at, now);
  const isLateLive =
    item.status === "ACTIVE"
      ? itemIsLate(item.estimated_minutes, item.started_at, null, now)
      : item.is_late;
  const color = item.color || "#2563eb";

  const statusVariant =
    item.status === "COMPLETED"
      ? "COMPLETED"
      : item.status === "ACTIVE"
        ? isLateLive
          ? "LATE"
          : "ACTIVE"
        : item.status === "SKIPPED"
          ? "SKIPPED"
          : "PENDING";

  const statusLabel =
    item.status === "COMPLETED"
      ? t("workflows.page.badge.completed")
      : item.status === "ACTIVE"
        ? isLateLive
          ? t("workflows.page.badge.late")
          : t("workflows.page.badge.inProgress")
        : item.status === "SKIPPED"
          ? t("workflows.page.steps.skip")
          : t("workflows.page.steps.start");

  return (
    <li
      className={`tcg-mini-card flex flex-col gap-1.5 rounded-xl px-2 py-2 shadow-sm ring-1 transition ${
        item.status === "ACTIVE"
          ? isLateLive
            ? "bg-rose-50/95 ring-rose-200"
            : "bg-blue-50/95 ring-blue-200"
          : "bg-white/90 ring-white/60"
      }`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: color }}
          aria-hidden
        >
          <Timer className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`break-words text-[12px] font-black leading-5 ${
              item.status === "COMPLETED" ? "text-emerald-800 line-through" : "text-slate-950"
            }`}
          >
            {item.title}
          </p>
          {item.description ? (
            <p className="mt-1 whitespace-pre-line break-words text-[11px] leading-5 text-slate-700">
              {item.description}
            </p>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <TaskStatusPill variant={statusVariant} label={statusLabel} compact />
            <span className="text-[9px] font-bold tabular-nums text-slate-600">
              {item.estimated_minutes}&apos;
            </span>
            {elapsed != null && item.status !== "PENDING" ? (
              <span
                className={`text-[9px] font-bold tabular-nums ${
                  isLateLive ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {formatHMS(elapsed)}
              </span>
            ) : null}
          </div>
          {item.late_reason ? (
            <p className="mt-0.5 line-clamp-1 text-[9px] font-bold text-rose-700">⚠ {item.late_reason}</p>
          ) : null}
        </div>
      </div>

      {(canStart || canComplete || canSkip) && item.status !== "COMPLETED" && item.status !== "SKIPPED" ? (
        <div className="flex gap-1">
          {canStart ? (
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 py-2 text-[10px] font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
              {t("workflows.page.steps.start")}
            </button>
          ) : null}
          {canComplete ? (
            <button
              type="button"
              onClick={onComplete}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
              {t("workflows.page.steps.complete")}
            </button>
          ) : null}
          {canSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold text-slate-600"
            >
              {t("workflows.page.steps.skip")}
            </button>
          ) : null}
        </div>
      ) : null}

      {isLateLive && item.status === "ACTIVE" ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {t("workflows.page.center.late")}
        </span>
      ) : null}
    </li>
  );
}
