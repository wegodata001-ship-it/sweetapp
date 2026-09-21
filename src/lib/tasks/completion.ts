import { computeActualMinutes, isTaskLate } from "@/lib/tasks/helpers";
import { itemIsLate } from "@/lib/workflows/run-helpers";

export type LateDurationParts =
  | { unit: "none"; value: 0 }
  | { unit: "minutes"; value: number }
  | { unit: "hours"; value: number }
  | { unit: "days"; value: number };

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calendarDayUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function calendarDayDiff(from: Date, to: Date): number {
  return Math.round((calendarDayUtc(to) - calendarDayUtc(from)) / 86_400_000);
}

/** Deadline: calendar due if present, otherwise startedAt + estimated minutes. */
export function taskDeadlineAt(input: {
  startedAt?: Date | string | null;
  estimatedMinutes?: number | null;
  targetDueAt?: Date | string | null;
}): Date | null {
  const due = toDate(input.targetDueAt ?? null);
  if (due) return due;
  const started = toDate(input.startedAt ?? null);
  const est = input.estimatedMinutes ?? 0;
  if (started && est > 0) {
    return new Date(started.getTime() + est * 60_000);
  }
  return null;
}

/**
 * End instant for late math: completedAt when the task is done, otherwise now.
 * Completed tasks must not keep accumulating late time.
 */
export function lateReferenceAt(input: {
  completedAt?: Date | string | null;
  nowMs?: number;
}): Date {
  const done = toDate(input.completedAt ?? null);
  if (done) return done;
  return new Date(input.nowMs ?? Date.now());
}

export function lateDurationMs(input: {
  startedAt?: Date | string | null;
  estimatedMinutes?: number | null;
  targetDueAt?: Date | string | null;
  completedAt?: Date | string | null;
  nowMs?: number;
}): number {
  const deadline = taskDeadlineAt(input);
  if (!deadline) return 0;
  const end = lateReferenceAt(input);
  return Math.max(0, end.getTime() - deadline.getTime());
}

export function lateDurationParts(ms: number): LateDurationParts {
  if (ms <= 0) return { unit: "none", value: 0 };
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return { unit: "minutes", value: minutes };
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  if (hours < 24) return { unit: "hours", value: hours };
  return { unit: "days", value: Math.max(1, Math.ceil(ms / 86_400_000)) };
}

export function describeLateness(input: {
  startedAt?: Date | string | null;
  estimatedMinutes?: number | null;
  targetDueAt?: Date | string | null;
  completedAt?: Date | string | null;
  nowMs?: number;
}): LateDurationParts {
  const deadline = taskDeadlineAt(input);
  if (!deadline) return { unit: "none", value: 0 };
  const end = lateReferenceAt(input);
  if (end.getTime() <= deadline.getTime()) return { unit: "none", value: 0 };

  if (input.targetDueAt) {
    const days = calendarDayDiff(deadline, end);
    if (days >= 1) return { unit: "days", value: days };
  }
  return lateDurationParts(end.getTime() - deadline.getTime());
}

/** Employee work task: timer overrun OR due date passed, frozen at completedAt. */
export function isEmployeeWorkTaskLate(input: {
  status: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  estimatedMinutes?: number | null;
  targetDueAt?: Date | string | null;
  nowMs?: number;
}): boolean {
  const started = toDate(input.startedAt ?? null);
  const done = toDate(input.completedAt ?? null);
  const end = done ?? new Date(input.nowMs ?? Date.now());
  const timerLate =
    started != null &&
    isTaskLate(input.estimatedMinutes, computeActualMinutes(started, end));
  const deadline = taskDeadlineAt(input);
  const dueLate = deadline != null && end.getTime() > deadline.getTime();
  return Boolean(timerLate || dueLate);
}

export function formatTaskDateTime(value: Date | string | null | undefined, locale: string): string {
  const d = toDate(value ?? null);
  if (!d) return "—";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isWorkflowItemLateNow(input: {
  estimatedMinutes: number;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  nowMs?: number;
}): boolean {
  return itemIsLate(
    input.estimatedMinutes,
    input.startedAt ?? null,
    input.completedAt ?? null,
    input.nowMs ?? Date.now(),
  );
}
