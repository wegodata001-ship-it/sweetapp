"use client";

import { AlertTriangle, CheckCircle2, Circle, Pause, Play, SkipForward, XCircle } from "lucide-react";
import type { WorkflowItemStatus, WorkflowRunStatus } from "@/lib/workflows/serialize";

export type TaskPillVariant =
  | WorkflowItemStatus
  | WorkflowRunStatus
  | "LATE"
  | "OPEN"
  | "ARCHIVED";

type Props = {
  variant: TaskPillVariant;
  label: string;
  compact?: boolean;
};

const STYLES: Record<string, string> = {
  PENDING: "bg-white/70 text-slate-700",
  ACTIVE: "bg-blue-600 text-white shadow-sm",
  COMPLETED: "bg-emerald-600 text-white",
  SKIPPED: "bg-slate-400 text-white",
  IN_PROGRESS: "bg-blue-600 text-white",
  ABORTED: "bg-slate-500 text-white",
  LATE: "bg-rose-600 text-white tcg-pulse-soft",
  OPEN: "bg-amber-500 text-white",
  ARCHIVED: "bg-slate-300 text-slate-700",
};

function PillIcon({ variant }: { variant: TaskPillVariant }) {
  const cls = "h-3 w-3 shrink-0";
  switch (variant) {
    case "COMPLETED":
      return <CheckCircle2 className={cls} aria-hidden />;
    case "ACTIVE":
    case "IN_PROGRESS":
      return <Play className={cls} aria-hidden />;
    case "LATE":
      return <AlertTriangle className={cls} aria-hidden />;
    case "ABORTED":
      return <XCircle className={cls} aria-hidden />;
    case "SKIPPED":
      return <SkipForward className={cls} aria-hidden />;
    case "PENDING":
      return <Circle className={cls} aria-hidden />;
    default:
      return <Pause className={cls} aria-hidden />;
  }
}

/** Small status chip for tasks and groups. */
export function TaskStatusPill({ variant, label, compact }: Props) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-black ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      } ${STYLES[variant] ?? STYLES.PENDING}`}
    >
      <PillIcon variant={variant} />
      <span className="truncate">{label}</span>
    </span>
  );
}
