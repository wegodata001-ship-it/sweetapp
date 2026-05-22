"use client";

import { AlertTriangle, Check, GripVertical, Loader2, Play, Timer } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { itemElapsedMs, itemIsLate } from "@/lib/workflows/run-helpers";
import type { WorkflowRunItemDto, WorkflowTemplateItemDto } from "@/lib/workflows/serialize";
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
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
};

type Props = RunItemProps | TemplateItemProps;

/** Compact task row inside a group card. */
export function TaskMiniCard(props: Props) {
  const { t } = useI18n();

  if (props.kind === "template") {
    const { item, index, canManage, onRemove, onMoveUp, onMoveDown, draggable, onDragStart, onDragOver, onDrop } =
      props;
    const color = item.task_color || "#64748b";
    return (
      <li
        className="tcg-mini-card flex items-center gap-1.5 rounded-xl bg-white/85 px-2 py-1.5 shadow-sm ring-1 ring-white/50"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {canManage ? (
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" aria-hidden />
        ) : null}
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white"
          style={{ background: color }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black text-slate-900">{item.display_title}</p>
          <p className="text-[9px] font-bold text-slate-500">
            {item.effective_minutes}&apos; {item.require_late_reason ? "· ⚠" : ""}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-col gap-0.5">
            <button type="button" onClick={onMoveUp} className="text-[9px] text-slate-500 hover:text-slate-800">
              ▲
            </button>
            <button type="button" onClick={onMoveDown} className="text-[9px] text-slate-500 hover:text-slate-800">
              ▼
            </button>
            <button type="button" onClick={onRemove} className="text-[9px] font-bold text-rose-600">
              ×
            </button>
          </div>
        ) : null}
      </li>
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
            className={`truncate text-[11px] font-black ${
              item.status === "COMPLETED" ? "text-emerald-800 line-through" : "text-slate-950"
            }`}
          >
            {item.title}
          </p>
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
